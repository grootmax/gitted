import { describe, expect, it } from 'vitest';
import { ASTParseError, PrimaryASTParser } from '../src/parsers/astParser.js';

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
