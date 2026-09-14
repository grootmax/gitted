import { describe, expect, it } from 'vitest';
import { FallbackTimeoutError, RegexFallbackParser } from '../src/parsers/regexFallbackParser.js';

describe('RegexFallbackParser', () => {
  const parser = new RegexFallbackParser();

  describe('JavaScript / TypeScript edge cases', () => {
    it('extracts dynamic imports, static imports, requires, and re-exports', () => {
      const code = `
        import defaultExport from "module-name";
        import * as name from "module-name-2";
        import { export1, export2 as alias2 } from './module-3';
        const dynamicMod = await import('./dynamic-module.js');
        const legacyMod = require('../legacy/helper');
        export { foo } from './re-exported';
      `;

      const deps = parser.parse('src/complex.js', code, 'javascript');
      const targets = deps.map((d) => d.target);

      expect(targets).toContain('module-name');
      expect(targets).toContain('module-name-2');
      expect(targets).toContain('./module-3');
      expect(targets).toContain('./dynamic-module.js');
      expect(targets).toContain('../legacy/helper');
      expect(targets).toContain('./re-exported');

      const dynamicDep = deps.find((d) => d.target === './dynamic-module.js');
      expect(dynamicDep?.type).toBe('dynamic_import');
      expect(dynamicDep?.confidence).toBe('fallback_heuristic');
    });
  });

  describe('Ruby edge cases', () => {
    it('extracts require, require_relative, and autoload dependencies', () => {
      const code = `
        # Ruby file with metaprogramming macro
        require 'json'
        require "active_record"
        require_relative "../config/environment"
        autoload :UserNotifier, 'notifiers/user_notifier'
      `;

      const deps = parser.parse('app/services/user_service.rb', code, 'ruby');
      const targets = deps.map((d) => d.target);

      expect(targets).toContain('json');
      expect(targets).toContain('active_record');
      expect(targets).toContain('../config/environment');
      expect(targets).toContain('notifiers/user_notifier');

      const autoloadDep = deps.find((d) => d.target === 'notifiers/user_notifier');
      expect(autoloadDep?.type).toBe('autoload');
    });
  });

  describe('Java edge cases', () => {
    it('extracts imports, static imports, and annotation dependency patterns', () => {
      const code = `
        package com.example.controller;

        import com.example.service.UserService;
        import static com.example.util.Constants.MAX_RETRY;
        import org.springframework.beans.factory.annotation.Autowired;

        @RestController
        @RequestMapping("/api/users")
        @Import(DatabaseConfig.class)
        public class UserController {
            @Autowired
            private UserService userService;
        }
      `;

      const deps = parser.parse('src/main/java/com/example/controller/UserController.java', code, 'java');
      const targets = deps.map((d) => d.target);

      expect(targets).toContain('com.example.service.UserService');
      expect(targets).toContain('com.example.util.Constants.MAX_RETRY');
      expect(targets).toContain('DatabaseConfig');
      expect(targets).toContain('RestController');
      expect(targets).toContain('Autowired');
    });
  });

  describe('Execution timeout guardrail (ReDoS protection)', () => {
    it('enforces execution timeout and throws FallbackTimeoutError when threshold is exceeded', () => {
      const StrictTimeoutParser = new RegexFallbackParser({ timeoutMs: 1 });
      
      // Generate large synthetic file that forces timeout check
      const longLines = Array.from({ length: 50000 }, (_, i) => `import { item${i} } from 'module-${i}';`).join('\n');

      expect(() => {
        StrictTimeoutParser.parse('large_file.js', longLines, 'javascript', { timeoutMs: 0 });
      }).toThrow(FallbackTimeoutError);
    });
  });
});
