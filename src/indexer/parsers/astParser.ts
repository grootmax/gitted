import * as ts from 'typescript';
import * as fs from 'fs';
import { ASTNodeSummary, FeatureOwnership, DbSchemaContext } from '../../types';

export interface ParsedAstResult {
  astSummary: ASTNodeSummary;
  featureOwnership?: FeatureOwnership;
  dbSchemaContext?: DbSchemaContext;
}

export async function parseAstAsync(
  filePath: string,
  content?: string
): Promise<ParsedAstResult> {
  return new Promise((resolve) => {
    // Execute AST parsing in next tick to avoid blocking main loop
    setImmediate(() => {
      try {
        const fileContent =
          content !== undefined
            ? content
            : fs.existsSync(filePath)
            ? fs.readFileSync(filePath, 'utf-8')
            : '';

        const sourceFile = ts.createSourceFile(
          filePath,
          fileContent,
          ts.ScriptTarget.Latest,
          true
        );

        const functions: string[] = [];
        const classes: string[] = [];
        const exportsList: string[] = [];
        const importsList: string[] = [];
        const tables: string[] = [];
        const models: string[] = [];
        const ddlOperations: Array<{ operation: 'CREATE' | 'ALTER' | 'DROP'; table: string }> = [];
        const seenOps = new Set<string>();

        let team = '';
        let owner = '';
        let feature = '';

        function addDdlOp(op: 'CREATE' | 'ALTER' | 'DROP', tbl: string) {
          const cleanTbl = tbl.trim().replace(/[`'"]/g, '');
          if (!cleanTbl) return;
          tables.push(cleanTbl);
          const key = `${op}:${cleanTbl}`;
          if (!seenOps.has(key)) {
            seenOps.add(key);
            ddlOperations.push({ operation: op, table: cleanTbl });
          }
        }

        // 1. Content-based Regex Scanning (SQL DDL, Prisma Schema, Knex, TypeORM)
        // SQL DDL
        const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`']?([a-zA-Z0-9_]+)["`']?/gi;
        let match: RegExpExecArray | null;
        while ((match = createTableRegex.exec(fileContent)) !== null) {
          if (match[1]) addDdlOp('CREATE', match[1]);
        }

        const alterTableRegex = /ALTER\s+TABLE\s+(?:ONLY\s+)?["`']?([a-zA-Z0-9_]+)["`']?/gi;
        while ((match = alterTableRegex.exec(fileContent)) !== null) {
          if (match[1]) addDdlOp('ALTER', match[1]);
        }

        const dropTableRegex = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`']?([a-zA-Z0-9_]+)["`']?/gi;
        while ((match = dropTableRegex.exec(fileContent)) !== null) {
          if (match[1]) addDdlOp('DROP', match[1]);
        }

        // TypeORM @Entity('table_name')
        const typeOrmEntityRegex = /@Entity\s*\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/gi;
        while ((match = typeOrmEntityRegex.exec(fileContent)) !== null) {
          if (match[1]) tables.push(match[1]);
        }

        // Prisma Schema definitions (model User { ... } or @@map("users"))
        const prismaModelRegex = /model\s+([a-zA-Z0-9_]+)\s*\{/gi;
        while ((match = prismaModelRegex.exec(fileContent)) !== null) {
          if (match[1]) models.push(match[1]);
        }
        const prismaMapRegex = /@@map\s*\(\s*['"]([a-zA-Z0-9_]+)['"]\s*\)/gi;
        while ((match = prismaMapRegex.exec(fileContent)) !== null) {
          if (match[1]) tables.push(match[1]);
        }

        // Knex schema operations in code
        const knexSchemaRegex = /(?:knex|schema)\.(createTable|alterTable|table|dropTable|dropTableIfExists)\s*\(\s*['"]([a-zA-Z0-9_]+)['"]/gi;
        while ((match = knexSchemaRegex.exec(fileContent)) !== null) {
          const method = match[1].toLowerCase();
          const tbl = match[2];
          if (tbl) {
            if (method === 'createtable') addDdlOp('CREATE', tbl);
            else if (method === 'droptable' || method === 'droptableifexists') addDdlOp('DROP', tbl);
            else addDdlOp('ALTER', tbl);
          }
        }

        // Extract comment-based feature ownership annotations (e.g. @owner, @team, @feature)
        const commentMatches = fileContent.match(/\/\/\s*@(owner|team|feature)\s+(.+)/gi);
        if (commentMatches) {
          for (const match of commentMatches) {
            const parts = match.replace(/\/\/\s*@/, '').split(/\s+/);
            const key = parts[0]?.toLowerCase();
            const val = parts.slice(1).join(' ').trim();
            if (key === 'team') team = val;
            if (key === 'owner') owner = val;
            if (key === 'feature') feature = val;
          }
        }

        // Default fallbacks if omitted
        if (!team && !owner && !feature) {
          if (filePath.includes('payment') || filePath.includes('checkout')) {
            team = 'Billing Team';
            owner = 'payment-devs';
            feature = 'Payment Gateway';
          } else if (filePath.includes('user') || filePath.includes('auth')) {
            team = 'Identity Team';
            owner = 'auth-devs';
            feature = 'User Authentication';
          }
        }

        function visit(node: ts.Node) {
          if (ts.isFunctionDeclaration(node) && node.name) {
            functions.push(node.name.text);
          } else if (ts.isMethodDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
            functions.push(node.name.text);
          } else if (ts.isClassDeclaration(node) && node.name) {
            const className = node.name.text;
            classes.push(className);
            
            // Check TypeORM decorators or Class name conventions
            const nodeText = node.getText(sourceFile);
            if (
              nodeText.includes('@Entity') ||
              nodeText.includes('@Column') ||
              className.endsWith('Entity') ||
              className.endsWith('Model') ||
              className.endsWith('Table')
            ) {
              models.push(className);
            }
          } else if (ts.isImportDeclaration(node)) {
            const moduleSpecifier = node.moduleSpecifier;
            if (ts.isStringLiteral(moduleSpecifier)) {
              importsList.push(moduleSpecifier.text);
            }
          } else if (ts.isExportAssignment(node) || ts.isExportDeclaration(node)) {
            exportsList.push(node.getText(sourceFile).slice(0, 50));
          } else if (ts.isCallExpression(node)) {
            const expressionText = node.expression.getText(sourceFile);
            if (expressionText.includes('SELECT') || expressionText.includes('FROM') || expressionText.includes('table')) {
              const argText = node.arguments[0]?.getText(sourceFile) || '';
              const tableMatch = argText.match(/FROM\s+([a-zA-Z0-9_]+)/i) || argText.match(/INTO\s+([a-zA-Z0-9_]+)/i);
              if (tableMatch && tableMatch[1]) {
                tables.push(tableMatch[1]);
              }
            }
            // Prisma client call e.g. prisma.user.findMany
            if (expressionText.startsWith('prisma.') || expressionText.startsWith('this.prisma.')) {
              const parts = expressionText.split('.');
              if (parts.length >= 2 && parts[1] && !['$connect', '$disconnect', '$transaction', '$executeRaw'].includes(parts[1])) {
                models.push(parts[1]);
                tables.push(parts[1]);
              }
            }
          }

          ts.forEachChild(node, visit);
        }

        visit(sourceFile);

        const uniqueTables = Array.from(new Set(tables));
        const uniqueModels = Array.from(new Set(models));

        const result: ParsedAstResult = {
          astSummary: {
            functions,
            classes,
            exports: exportsList,
            imports: importsList,
          },
          featureOwnership:
            team || owner || feature
              ? { team: team || 'Core Team', owner: owner || 'dev', feature: feature || 'General' }
              : undefined,
          dbSchemaContext:
            uniqueTables.length > 0 || uniqueModels.length > 0 || ddlOperations.length > 0
              ? {
                  tables: uniqueTables,
                  models: uniqueModels,
                  ddlOperations: ddlOperations.length > 0 ? ddlOperations : undefined,
                }
              : undefined,
        };

        resolve(result);
      } catch (error) {
        resolve({
          astSummary: { functions: [], classes: [], exports: [], imports: [] },
        });
      }
    });
  });
}
