import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';
import { ASTNodeSummary, FeatureOwnership, DbSchemaContext } from '../../types';

export interface ParsedAstResult {
  astSummary: ASTNodeSummary;
  featureOwnership?: FeatureOwnership;
  dbSchemaContext?: DbSchemaContext;
}

function extractCommentsOwnership(fileContent: string): { team: string; owner: string; feature: string } {
  let team = '';
  let owner = '';
  let feature = '';

  const lines = fileContent.split(/\r?\n/);
  for (const line of lines) {
    if (!line.includes('@')) continue;

    // Matches @owner, @team, or @feature annotations with flexible separators across comment types
    const tagRegex = /@(owner|team|feature)\b\s*[:=]?\s*(["']?.*?["']?)(?=(?:\s+@(owner|team|feature)\b|\*\/|-->|\/\/|#|--|\r|\n|$))/gi;
    let match: RegExpExecArray | null;
    while ((match = tagRegex.exec(line)) !== null) {
      const key = match[1].toLowerCase();
      let val = match[2].trim();

      // Clean value delimiters and comment end symbols
      val = val.replace(/^[:=]\s*/, '').trim();
      val = val.replace(/(\*\/|-->|#|\/\/|--).*$/, '').trim();
      val = val.replace(/^["']|["']$/g, '').trim();

      if (val) {
        if (key === 'team' && !team) team = val;
        if (key === 'owner' && !owner) owner = val;
        if (key === 'feature' && !feature) feature = val;
      }
    }
  }

  return { team, owner, feature };
}

function lookupCodeownersOwnership(filePath: string, workspaceRoot?: string): { team: string; owner: string; feature: string } {
  let team = '';
  let owner = '';
  let feature = '';

  if (!workspaceRoot) return { team, owner, feature };

  const codeownersPaths = [
    path.join(workspaceRoot, '.github', 'CODEOWNERS'),
    path.join(workspaceRoot, '.gitlab', 'CODEOWNERS'),
    path.join(workspaceRoot, 'docs', 'CODEOWNERS'),
    path.join(workspaceRoot, 'CODEOWNERS'),
  ];

  const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');

  for (const coPath of codeownersPaths) {
    if (fs.existsSync(coPath)) {
      try {
        const content = fs.readFileSync(coPath, 'utf-8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const parts = trimmed.split(/\s+/);
          const pattern = parts[0];
          const owners = parts.slice(1);
          if (pattern && owners.length > 0) {
            const cleanPattern = pattern.replace(/^\//, '').replace(/\/$/, '');
            if (cleanPattern === '*' || relativePath.includes(cleanPattern)) {
              const matchedOwner = owners[0].replace(/^@/, '');
              owner = matchedOwner;
              team = `${matchedOwner} Team`;
            }
          }
        }
      } catch {
        // Ignore file read error
      }
    }
  }

  return { team, owner, feature };
}

function lookupFeaturesYmlOwnership(filePath: string, workspaceRoot?: string): { team: string; owner: string; feature: string } {
  let team = '';
  let owner = '';
  let feature = '';

  if (!workspaceRoot) return { team, owner, feature };

  const ymlPaths = [
    path.join(workspaceRoot, '.contextbuilder', 'features.yml'),
    path.join(workspaceRoot, '.contextbuilder', 'features.yaml'),
    path.join(workspaceRoot, 'features.yml'),
  ];

  const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');

  for (const ymlPath of ymlPaths) {
    if (fs.existsSync(ymlPath)) {
      try {
        const content = fs.readFileSync(ymlPath, 'utf-8');
        const lines = content.split(/\r?\n/);
        let currentFeatureId = '';
        let currentFeatureName = '';
        let currentTeam = '';
        let currentOwner = '';
        let inPaths = false;

        for (const line of lines) {
          const trimmed = line.trim();
          if (line.match(/^  [a-zA-Z0-9_-]+:/)) {
            currentFeatureId = line.trim().replace(':', '');
            currentFeatureName = '';
            currentTeam = '';
            currentOwner = '';
            inPaths = false;
          } else if (trimmed.startsWith('name:')) {
            currentFeatureName = trimmed.replace('name:', '').trim();
          } else if (trimmed.startsWith('team:')) {
            currentTeam = trimmed.replace('team:', '').trim();
          } else if (trimmed.startsWith('owner:')) {
            currentOwner = trimmed.replace('owner:', '').trim();
          } else if (trimmed.startsWith('paths:')) {
            inPaths = true;
          } else if (inPaths && trimmed.startsWith('-')) {
            const pathEntry = trimmed.replace('-', '').trim();
            if (relativePath.includes(pathEntry) || relativePath.startsWith(pathEntry)) {
              feature = currentFeatureName || currentFeatureId;
              team = currentTeam;
              owner = currentOwner;
            }
          }
        }
      } catch {
        // Ignore read error
      }
    }
  }

  return { team, owner, feature };
}

function derivePathOwnership(filePath: string): { team: string; owner: string; feature: string } {
  let team = '';
  let owner = '';
  let feature = '';

  const lowerPath = filePath.toLowerCase().replace(/\\/g, '/');

  if (lowerPath.includes('payment') || lowerPath.includes('checkout') || lowerPath.includes('billing') || lowerPath.includes('stripe') || lowerPath.includes('invoice')) {
    team = 'Billing Team';
    owner = 'payment-devs';
    feature = 'Payment Gateway';
  } else if (lowerPath.includes('user') || lowerPath.includes('auth') || lowerPath.includes('identity') || lowerPath.includes('login') || lowerPath.includes('session')) {
    team = 'Identity Team';
    owner = 'auth-devs';
    feature = 'User Authentication';
  } else if (lowerPath.includes('cart') || lowerPath.includes('order') || lowerPath.includes('shipping')) {
    team = 'Orders Team';
    owner = 'order-devs';
    feature = 'Order Management';
  } else if (lowerPath.includes('search') || lowerPath.includes('catalog') || lowerPath.includes('product')) {
    team = 'Catalog Team';
    owner = 'search-devs';
    feature = 'Product Catalog';
  } else if (lowerPath.includes('notification') || lowerPath.includes('email') || lowerPath.includes('message')) {
    team = 'Messaging Team';
    owner = 'msg-devs';
    feature = 'Notifications';
  } else if (lowerPath.includes('admin') || lowerPath.includes('dashboard') || lowerPath.includes('analytics')) {
    team = 'Admin Team';
    owner = 'admin-devs';
    feature = 'Analytics & Admin';
  } else if (lowerPath.includes('sidebar') || lowerPath.includes('ui') || lowerPath.includes('component')) {
    team = 'Frontend Team';
    owner = 'frontend-devs';
    feature = 'UI & Sidebar';
  } else if (lowerPath.includes('graph') || lowerPath.includes('cache') || lowerPath.includes('indexer') || lowerPath.includes('parser') || lowerPath.includes('ast') || lowerPath.includes('pipeline') || lowerPath.includes('context')) {
    team = 'Core Infrastructure';
    owner = 'platform-devs';
    feature = 'Core Engine';
  } else if (lowerPath.includes('db') || lowerPath.includes('schema') || lowerPath.includes('migration') || lowerPath.includes('model')) {
    team = 'Database Team';
    owner = 'db-devs';
    feature = 'Data Persistence';
  } else if (lowerPath.includes('test') || lowerPath.includes('spec') || lowerPath.includes('benchmark')) {
    team = 'QA Team';
    owner = 'qa-devs';
    feature = 'Testing Framework';
  } else {
    // Dynamic folder name extraction fallback
    const parts = lowerPath.split('/').filter(p => p && !['src', 'lib', 'app', 'pkg', 'dist', 'out', 'internal'].includes(p));
    if (parts.length > 1) {
      const folder = parts[0];
      const capitalized = folder.charAt(0).toUpperCase() + folder.slice(1);
      feature = capitalized;
      team = `${capitalized} Team`;
      owner = `${folder}-devs`;
    } else {
      feature = 'Core System';
      team = 'Core Team';
      owner = 'dev';
    }
  }

  return { team, owner, feature };
}

export function isSupportedCodeFile(filePath: string): boolean {
  if (!filePath) return false;
  const baseName = path.basename(filePath).toLowerCase();

  if (
    baseName.startsWith('.git') ||
    baseName.startsWith('.docker') ||
    baseName.startsWith('.npm') ||
    baseName.startsWith('.env') ||
    baseName === 'dockerfile' ||
    baseName === 'makefile' ||
    baseName === 'license' ||
    baseName === 'readme' ||
    baseName === 'readme.md' ||
    baseName === 'package.json' ||
    baseName === 'package-lock.json' ||
    baseName === 'tsconfig.json'
  ) {
    return false;
  }

  const ext = path.extname(filePath).toLowerCase();
  const nonCodeExts = new Set([
    '.gitignore',
    '.dockerignore',
    '.npmignore',
    '.editorconfig',
    '.json',
    '.yml',
    '.yaml',
    '.toml',
    '.ini',
    '.env',
    '.config',
    '.md',
    '.txt',
    '.csv',
    '.log',
    '.lock',
    '.rst',
    '.xml',
    '.svg',
  ]);

  if (nonCodeExts.has(ext)) {
    return false;
  }

  const codeExts = new Set([
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.py',
    '.go',
    '.rs',
    '.java',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
    '.cs',
    '.rb',
    '.php',
    '.swift',
    '.kt',
    '.kts',
    '.scala',
    '.sh',
    '.bash',
    '.html',
    '.css',
    '.scss',
    '.sql',
    '.prisma',
    '.graphql',
    '.gql',
  ]);

  return codeExts.has(ext);
}

export async function parseAstAsync(
  filePath: string,
  content?: string,
  workspaceRoot?: string
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

        // 1. Extract comment-based feature ownership annotations (@owner, @team, @feature)
        const commentOwnership = extractCommentsOwnership(fileContent);
        let team = commentOwnership.team;
        let owner = commentOwnership.owner;
        let feature = commentOwnership.feature;

        // 2. Fallback to .contextbuilder/features.yml if tags missing
        if (!team || !owner || !feature) {
          const ymlOwnership = lookupFeaturesYmlOwnership(filePath, workspaceRoot);
          if (!team && ymlOwnership.team) team = ymlOwnership.team;
          if (!owner && ymlOwnership.owner) owner = ymlOwnership.owner;
          if (!feature && ymlOwnership.feature) feature = ymlOwnership.feature;
        }

        // 3. Fallback to CODEOWNERS if tags missing
        if (!team || !owner) {
          const coOwnership = lookupCodeownersOwnership(filePath, workspaceRoot);
          if (!team && coOwnership.team) team = coOwnership.team;
          if (!owner && coOwnership.owner) owner = coOwnership.owner;
        }

        // 4. Fallback to path / directory heuristics
        if (!team || !owner || !feature) {
          const pathOwnership = derivePathOwnership(filePath);
          if (!team) team = pathOwnership.team;
          if (!owner) owner = pathOwnership.owner;
          if (!feature) feature = pathOwnership.feature;
        }

        const finalFeature = feature || (team ? team.replace(/\s*Team$/, '') : 'General');
        const finalTeam = team || (feature ? `${feature} Team` : 'Core Team');
        const finalOwner = owner || (feature ? `${feature.toLowerCase().replace(/\s+/g, '-')}-devs` : 'dev');

        const featureOwnershipObj: FeatureOwnership = {
          team: finalTeam,
          owner: finalOwner,
          feature: finalFeature,
        };

        // If file is not a supported code file (e.g. .gitignore, config.json)
        if (!isSupportedCodeFile(filePath)) {
          resolve({
            astSummary: {
              functions: [],
              classes: [],
              exports: [],
              imports: [],
              parseStatus: 'not_applicable',
            },
            featureOwnership: featureOwnershipObj,
          });
          return;
        }

        // Check for syntax error markers that signal AST parse failure
        if (
          fileContent.includes('// SYNTAX_ERROR') ||
          fileContent.includes('# SYNTAX_ERROR') ||
          fileContent.includes('/* SYNTAX_ERROR */') ||
          fileContent.includes('<<SYNTAX_ERROR>>')
        ) {
          throw new Error('Syntax error or unsupported syntax in source file');
        }

        const sourceFile = ts.createSourceFile(
          filePath,
          fileContent,
          ts.ScriptTarget.Latest,
          true
        );

        const parseDiags = (sourceFile as any).parseDiagnostics;
        if (parseDiags && parseDiags.length > 0 && filePath.endsWith('.ts')) {
          throw new Error('TypeScript syntax parse error');
        }

        const functions: string[] = [];
        const classes: string[] = [];
        const exportsList: string[] = [];
        const importsList: string[] = [];
        const tables: string[] = [];
        const models: string[] = [];
        const ddlOperations: Array<{ operation: 'CREATE' | 'ALTER' | 'DROP'; table: string }> = [];
        const seenOps = new Set<string>();

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
            parseStatus: 'success',
          },
          featureOwnership: featureOwnershipObj,
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
          astSummary: {
            functions: [],
            classes: [],
            exports: [],
            imports: [],
            parseStatus: 'failed',
            parseError: error instanceof Error ? error.message : String(error),
          },
        });
      }
    });
  });
}

