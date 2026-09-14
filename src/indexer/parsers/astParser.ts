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

        let team = '';
        let owner = '';
        let feature = '';

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
            classes.push(node.name.text);
            if (node.name.text.endsWith('Entity') || node.name.text.endsWith('Model') || node.name.text.endsWith('Table')) {
              models.push(node.name.text);
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
          }

          ts.forEachChild(node, visit);
        }

        visit(sourceFile);

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
            tables.length > 0 || models.length > 0
              ? { tables: Array.from(new Set(tables)), models: Array.from(new Set(models)) }
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
