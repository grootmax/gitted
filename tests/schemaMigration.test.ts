import { describe, it, expect } from 'vitest';
import { parseAstAsync } from '../src/indexer/parsers/astParser.js';
import { ScoringEngine } from '../src/scorer.js';
import { DependencyGraph } from '../src/graph.js';
import { GraphStore } from '../src/graph/graphStore.js';
import { ContextBuilder } from '../src/context/contextBuilder.js';
import { FeatureDefinition } from '../src/types.js';

describe('Dedicated Schema Migration AST Parsers and Feature Lineage Engine', () => {
  it('Requirement 1 & Acceptance Criterion 2: parseAstAsync extracts DDL statements and ORM model annotations', async () => {
    // 1. SQL DDL
    const sqlFile = 'db/migrations/001_create_payments.sql';
    const sqlContent = `
      CREATE TABLE payments (
        id VARCHAR(36) PRIMARY KEY,
        amount DECIMAL(10, 2) NOT NULL
      );
      ALTER TABLE payments ADD COLUMN status VARCHAR(20);
      DROP TABLE IF EXISTS old_payments;
    `;
    const sqlResult = await parseAstAsync(sqlFile, sqlContent);
    expect(sqlResult.dbSchemaContext).toBeDefined();
    expect(sqlResult.dbSchemaContext?.tables).toContain('payments');
    expect(sqlResult.dbSchemaContext?.tables).toContain('old_payments');
    expect(sqlResult.dbSchemaContext?.ddlOperations).toBeDefined();
    expect(sqlResult.dbSchemaContext?.ddlOperations?.some(op => op.operation === 'CREATE' && op.table === 'payments')).toBe(true);

    // 2. TypeORM Entity
    const typeOrmFile = 'src/entities/PaymentEntity.ts';
    const typeOrmContent = `
      import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

      @Entity('payments_table')
      export class PaymentEntity {
        @PrimaryGeneratedColumn()
        id: number;

        @Column()
        amount: number;
      }
    `;
    const typeOrmResult = await parseAstAsync(typeOrmFile, typeOrmContent);
    expect(typeOrmResult.dbSchemaContext?.tables).toContain('payments_table');
    expect(typeOrmResult.dbSchemaContext?.models).toContain('PaymentEntity');

    // 3. Prisma Schema
    const prismaFile = 'prisma/schema.prisma';
    const prismaContent = `
      model User {
        id Int @id @default(autoincrement())
        email String @unique
        @@map("users_table")
      }
    `;
    const prismaResult = await parseAstAsync(prismaFile, prismaContent);
    expect(prismaResult.dbSchemaContext?.models).toContain('User');
    expect(prismaResult.dbSchemaContext?.tables).toContain('users_table');

    // 4. Knex Migrations
    const knexFile = 'migrations/20260914_create_orders.js';
    const knexContent = `
      exports.up = function(knex) {
        return knex.schema.createTable('orders', function(table) {
          table.increments('id');
          table.string('order_number');
        });
      };
    `;
    const knexResult = await parseAstAsync(knexFile, knexContent);
    expect(knexResult.dbSchemaContext?.tables).toContain('orders');
    expect(knexResult.dbSchemaContext?.ddlOperations?.some(op => op.operation === 'CREATE' && op.table === 'orders')).toBe(true);
  });

  it('Requirement 3 & Acceptance Criterion 4: ScoringEngine boosts migration files with table entity matches bypassing shallow dampening', () => {
    const scorer = new ScoringEngine();
    const graph = new DependencyGraph();

    const migrationPath = 'db/migrations/001_create_payments.sql';
    graph.addFile(migrationPath);

    const paymentsFeature: FeatureDefinition = {
      id: 'payments',
      name: 'Payments Feature',
      tables: ['payments'],
      pathPatterns: ['src/services/payment/*'],
    };

    // Calculate score with dbSchemaContext indicating 'payments' table match
    const scoreResult = scorer.calculateScore(
      migrationPath,
      paymentsFeature,
      graph,
      undefined,
      { tables: ['payments'], models: [] }
    );

    // Must bypass dampening (bypassedDampening = true, pathDepthWeight = 1.0)
    expect(scoreResult.breakdown.bypassedDampening).toBe(true);
    expect(scoreResult.breakdown.pathDepthWeight).toBe(1.0);
    expect(scoreResult.score).toBeGreaterThanOrEqual(30);
    expect(scoreResult.suppressed).toBe(false);
  });

  it('Requirement 2 & Acceptance Criterion 3: ContextBuilder stores and retrieves schema lineage across feature timelines', () => {
    const graphStore = new GraphStore();
    const contextBuilder = new ContextBuilder(graphStore);

    contextBuilder.recordSchemaMigration({
      tableName: 'payments',
      operation: 'CREATE',
      prNumber: 101,
      commitHash: 'c101',
      filePath: 'db/migrations/001_create_payments.sql',
      description: 'Create initial payments schema',
    });

    contextBuilder.recordSchemaMigration({
      tableName: 'payments',
      operation: 'ALTER',
      prNumber: 152,
      commitHash: 'c152',
      filePath: 'db/migrations/002_add_status_column.sql',
      description: 'Add status column to payments',
    });

    const lineage = contextBuilder.getSchemaLineage('payments');
    expect(lineage.length).toBe(2);
    expect(lineage[0].operation).toBe('CREATE');
    expect(lineage[0].prNumber).toBe(101);
    expect(lineage[1].operation).toBe('ALTER');
    expect(lineage[1].prNumber).toBe(152);
  });
});
