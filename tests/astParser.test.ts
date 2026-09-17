import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ASTParseError, PrimaryASTParser } from '../src/parsers/astParser.js';
import { parseAstAsync } from '../src/indexer/parsers/astParser.js';

describe('PrimaryASTParser', () => {
  const parser = new PrimaryASTParser();

  it('parses valid JavaScript static imports and require statements successfully', () => {
    const code = `
      import React from 'react';
      import { useState } from 'react';
      const utils = require('./utils');
    `;
    const result = parser.parse('src/app.js', code, 'javascript');
    expect(result.status).toBe('ok');
    expect(result.dependencies).toHaveLength(3);
    expect(result.dependencies[0]).toMatchObject({
      source: 'src/app.js',
      target: 'react',
      type: 'import',
      confidence: 'ast_high',
    });
    expect(result.dependencies[2]).toMatchObject({
      source: 'src/app.js',
      target: './utils',
      type: 'require',
      confidence: 'ast_high',
    });
  });

  it('parses valid Ruby require and require_relative statements successfully', () => {
    const code = `
      require 'json'
      require_relative 'helpers/user_helper'
    `;
    const result = parser.parse('lib/user.rb', code, 'ruby');
    expect(result.status).toBe('ok');
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies[0]).toMatchObject({
      target: 'json',
      type: 'require',
      confidence: 'ast_high',
    });
    expect(result.dependencies[1]).toMatchObject({
      target: 'helpers/user_helper',
      type: 'require_relative',
      confidence: 'ast_high',
    });
  });

  it('parses valid Java import statements successfully', () => {
    const code = `
      package com.example.service;
      import com.example.model.User;
      import static com.example.util.Constants.*;
    `;
    const result = parser.parse('src/com/example/service/UserService.java', code, 'java');
    expect(result.status).toBe('ok');
    expect(result.dependencies).toHaveLength(2);
    expect(result.dependencies[0].target).toBe('com.example.model.User');
    expect(result.dependencies[1].target).toBe('com.example.util.Constants.*');
  });

  it('throws ASTParseError on syntax error comments or non-standard dynamic syntax', () => {
    const codeWithDynamicImport = `
      const lazyModule = await import('./dynamicModule');
    `;
    expect(() => {
      parser.parse('src/dynamic.js', codeWithDynamicImport, 'javascript');
    }).toThrow(ASTParseError);

    const codeWithSyntaxError = `
      // SYNTAX_ERROR
      const x = ;
    `;
    expect(() => {
      parser.parse('src/broken.js', codeWithSyntaxError, 'javascript');
    }).toThrow(ASTParseError);
  });
});

describe('parseAstAsync Feature Ownership Extraction', () => {
  it('extracts feature ownership from single-line JS/TS comment tags with colons and quotes', async () => {
    const code = `
      // @team: "Billing Team"
      // @owner: "payment-devs"
      // @feature: "Checkout V2"
      export function checkout() {}
    `;
    const res = await parseAstAsync('src/checkout.ts', code);
    expect(res.featureOwnership).toEqual({
      team: 'Billing Team',
      owner: 'payment-devs',
      feature: 'Checkout V2',
      source: 'file',
    });
  });

  it('extracts feature ownership from Python hash comments', async () => {
    const code = `
      # @team: Identity Team
      # @owner: auth-devs
      # @feature: User Authentication
      def login(): pass
    `;
    const res = await parseAstAsync('src/auth.py', code);
    expect(res.featureOwnership).toEqual({
      team: 'Identity Team',
      owner: 'auth-devs',
      feature: 'User Authentication',
      source: 'file',
    });
  });

  it('extracts feature ownership from JSDoc/C-style block comments', async () => {
    const code = `
      /**
       * @team Catalog Team
       * @owner search-devs
       * @feature Product Search
       */
      class ProductCatalog {}
    `;
    const res = await parseAstAsync('src/catalog.ts', code);
    expect(res.featureOwnership).toEqual({
      team: 'Catalog Team',
      owner: 'search-devs',
      feature: 'Product Search',
      source: 'file',
    });
  });

  it('extracts feature ownership from HTML/XML comments', async () => {
    const code = `
      <!-- @team: Frontend Team -->
      <!-- @owner: frontend-devs -->
      <!-- @feature: UI Sidebar -->
      <div>Sidebar Content</div>
    `;
    const res = await parseAstAsync('src/sidebar.html', code);
    expect(res.featureOwnership).toEqual({
      team: 'Frontend Team',
      owner: 'frontend-devs',
      feature: 'UI Sidebar',
      source: 'file',
    });
  });

  it('returns undefined feature ownership when no evidence exists, without full path guessing', async () => {
    const code = `export class OrderService {}`;
    const res = await parseAstAsync('/Users/username/Identity/gitted/.gitignore', code);
    expect(res.featureOwnership).toBeUndefined();
  });

  it('extracts feature ownership from CODEOWNERS file with source codeowners', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codeowners-test-'));
    const githubDir = path.join(tmpDir, '.github');
    fs.mkdirSync(githubDir, { recursive: true });
    fs.writeFileSync(path.join(githubDir, 'CODEOWNERS'), 'src/payment/* @payment-team\n');

    const filePath = path.join(tmpDir, 'src', 'payment', 'processor.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'export function pay() {}');

    const res = await parseAstAsync(filePath, undefined, tmpDir);
    expect(res.featureOwnership).toEqual({
      team: 'payment-team Team',
      owner: 'payment-team',
      source: 'codeowners',
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('extracts feature ownership from .contextbuilder/features.yml with source feature_config', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'features-test-'));
    const cbDir = path.join(tmpDir, '.contextbuilder');
    fs.mkdirSync(cbDir, { recursive: true });
    fs.writeFileSync(
      path.join(cbDir, 'features.yml'),
      `
  feat_billing:
    name: Billing Engine
    team: Finance Team
    owner: fin-devs
    paths:
      - src/billing
`
    );

    const filePath = path.join(tmpDir, 'src', 'billing', 'invoice.ts');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'export class Invoice {}');

    const res = await parseAstAsync(filePath, undefined, tmpDir);
    expect(res.featureOwnership).toEqual({
      feature: 'Billing Engine',
      team: 'Finance Team',
      owner: 'fin-devs',
      source: 'feature_config',
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

