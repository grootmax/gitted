import { describe, expect, it } from 'vitest';
import { StaticAnalysisPipeline } from '../src/pipeline/staticAnalysisPipeline.js';

describe('StaticAnalysisPipeline', () => {
  it('gracefully handles AST parse failure, falls back to regex scanner, and sets status to degraded_fallback', () => {
    const pipeline = new StaticAnalysisPipeline();
    const sourceCode = `
      // JS file with dynamic require / non-standard syntax that crashes strict AST parser
      import('dynamic-module.js');
      const helper = require('./helper');
    `;

    const node = pipeline.analyzeFile({
      filePath: 'src/dynamic.js',
      sourceCode,
      language: 'javascript',
    });

    expect(node.id).toBe('src/dynamic.js');
    expect(node.parse_status).toBe('degraded_fallback');
    expect(node.dependencies.map((d) => d.target)).toEqual(['dynamic-module.js', './helper']);
    expect(node.error_details).toBeDefined();
    expect(node.error_details?.filePath).toBe('src/dynamic.js');
    expect(pipeline.getErrorLogs()).toHaveLength(1);
    expect(pipeline.getErrorLogs()[0].filePath).toBe('src/dynamic.js');
  });

  it('sets parse_status to ok for valid AST parse without calling fallback', () => {
    const pipeline = new StaticAnalysisPipeline();
    const sourceCode = `
      import React from 'react';
      import { render } from 'react-dom';
    `;

    const node = pipeline.analyzeFile({
      filePath: 'src/index.js',
      sourceCode,
      language: 'javascript',
    });

    expect(node.parse_status).toBe('ok');
    expect(node.dependencies).toHaveLength(2);
    expect(node.dependencies.every((d) => d.confidence === 'ast_high')).toBe(true);
    expect(pipeline.getErrorLogs()).toHaveLength(0);
  });

  it('analyzes repository batch without aborting when some files fail AST parsing', () => {
    const pipeline = new StaticAnalysisPipeline();
    const files = [
      {
        filePath: 'src/valid.js',
        sourceCode: `import { foo } from './foo';`,
        language: 'javascript' as const,
      },
      {
        filePath: 'src/broken.js',
        sourceCode: `
          // SYNTAX_ERROR
          import('./dynamic');
          require('./legacy');
        `,
        language: 'javascript' as const,
      },
      {
        filePath: 'lib/service.rb',
        sourceCode: `
          require 'json'
          require_relative 'config'
        `,
        language: 'ruby' as const,
      },
    ];

    const nodes = pipeline.analyzeRepository(files);

    expect(nodes).toHaveLength(3);
    expect(nodes[0].parse_status).toBe('ok');
    expect(nodes[1].parse_status).toBe('degraded_fallback');
    expect(nodes[1].dependencies.map((d) => d.target)).toEqual(['./dynamic', './legacy']);
    expect(nodes[2].parse_status).toBe('ok');
    expect(pipeline.getErrorLogs()).toHaveLength(1);
  });
});
