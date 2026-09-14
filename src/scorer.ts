import { FeatureDefinition, ScoringConfig, FeatureAssociationScore, FeatureScoreBreakdown } from './types.js';
import { DependencyGraph } from './graph.js';

export class ScoringEngine {
  private config: Required<ScoringConfig>;
  private pathMatchCache: Map<string, { matches: boolean; isExplicit: boolean }> = new Map();

  constructor(config?: ScoringConfig) {
    this.config = {
      basePathMatchScore: config?.basePathMatchScore ?? 40,
      baseImportScore: config?.baseImportScore ?? 15,
      baseExplicitTagScore: config?.baseExplicitTagScore ?? 50,
      fanOutThreshold: config?.fanOutThreshold ?? 10,
      shallowPathDepthThreshold: config?.shallowPathDepthThreshold ?? 2,
      shallowPathWeight: config?.shallowPathWeight ?? 0.25,
      shallowPathPatterns: config?.shallowPathPatterns ?? [
        'src/utils/*',
        'utils/*',
        'db/migrations/*',
        'migrations/*',
        'shared/*',
        'common/*',
        'src/common/*',
        'src/shared/*'
      ],
      notificationThreshold: config?.notificationThreshold ?? 30,
    };
  }

  /**
   * Check if a path matches a wildcard/glob pattern.
   */
  private matchPattern(filePath: string, pattern: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const normalizedPattern = pattern.replace(/\\/g, '/');

    if (normalizedPattern.endsWith('/*')) {
      const prefix = normalizedPattern.slice(0, -2);
      return normalizedPath.startsWith(prefix + '/') || normalizedPath === prefix;
    }
    if (normalizedPattern.startsWith('*')) {
      const suffix = normalizedPattern.slice(1);
      return normalizedPath.endsWith(suffix);
    }
    return normalizedPath.includes(normalizedPattern) || normalizedPath === normalizedPattern;
  }

  /**
   * Determines if a file path is considered a shallow/shared directory path.
   */
  public isShallowSharedPath(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/');
    
    // Check pattern matches
    for (const pattern of this.config.shallowPathPatterns) {
      if (this.matchPattern(normalized, pattern)) {
        return true;
      }
    }

    // Check path depth
    const parts = normalized.split('/').filter(Boolean);
    // If path is e.g. 'utils/http.ts' or 'src/utils/http.ts' with shallow depth
    if (parts.length <= this.config.shallowPathDepthThreshold + 1) {
      if (['utils', 'common', 'shared', 'migrations', 'helpers', 'db'].includes(parts[0]) ||
          (parts[0] === 'src' && ['utils', 'common', 'shared', 'migrations', 'helpers', 'db'].includes(parts[1]))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if file path matches feature path definitions.
   */
  public isPathMatch(filePath: string, feature: FeatureDefinition): { matches: boolean; isExplicit: boolean } {
    const cacheKey = `${filePath}:${feature.id}`;
    const cached = this.pathMatchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const normalized = filePath.replace(/\\/g, '/');
    let result = { matches: false, isExplicit: false };

    // 1. Check explicit paths
    if (feature.explicitPaths) {
      for (const explicitPath of feature.explicitPaths) {
        if (this.matchPattern(normalized, explicitPath) || normalized === explicitPath.replace(/\\/g, '/')) {
          result = { matches: true, isExplicit: true };
          this.pathMatchCache.set(cacheKey, result);
          return result;
        }
      }
    }

    // 2. Check general path patterns
    if (feature.pathPatterns) {
      for (const pattern of feature.pathPatterns) {
        if (this.matchPattern(normalized, pattern)) {
          result = { matches: true, isExplicit: false };
          this.pathMatchCache.set(cacheKey, result);
          return result;
        }
      }
    }

    // 3. Fallback: match feature name in path (e.g. 'checkout' in 'src/features/checkout/Cart.tsx')
    const lowerPath = normalized.toLowerCase();
    const lowerFeatureName = feature.name.toLowerCase();
    const lowerFeatureId = feature.id.toLowerCase();

    if (lowerPath.includes(`/${lowerFeatureId}/`) || lowerPath.includes(`/${lowerFeatureName}/`)) {
      result = { matches: true, isExplicit: false };
      this.pathMatchCache.set(cacheKey, result);
      return result;
    }

    this.pathMatchCache.set(cacheKey, result);
    return result;
  }

  /**
   * Clear cache if needed.
   */
  public clearCache(): void {
    this.pathMatchCache.clear();
  }

  /**
   * Check if file path or context has an explicit developer tag matching the feature.
   */
  public hasExplicitTag(providedTags: string[] | undefined, feature: FeatureDefinition): boolean {
    if (!providedTags || providedTags.length === 0 || !feature.tags || feature.tags.length === 0) {
      return false;
    }
    return feature.tags.some(ftag => providedTags.some(ptag => ptag.toLowerCase() === ftag.toLowerCase()));
  }

  /**
   * Check if schema entities or table names in dbSchemaContext match a feature's tables, name, id, or tags.
   */
  public hasSchemaMatch(
    filePath: string,
    feature: FeatureDefinition,
    dbSchemaContext?: { tables?: string[]; models?: string[] },
    providedTables?: string[]
  ): boolean {
    const candidateTables: string[] = [];

    if (dbSchemaContext) {
      if (dbSchemaContext.tables) candidateTables.push(...dbSchemaContext.tables);
      if (dbSchemaContext.models) candidateTables.push(...dbSchemaContext.models);
    }

    if (providedTables) {
      candidateTables.push(...providedTables);
    }

    const featureTargets = new Set<string>();
    if (feature.tables) {
      feature.tables.forEach(t => featureTargets.add(t.toLowerCase()));
    }
    // Only include feature id/name/tags if they are specific domain targets, not generic shallow path names
    const genericShallowTerms = new Set(['utils', 'common', 'shared', 'helpers', 'utility', 'utility feature']);
    if (!genericShallowTerms.has(feature.id.toLowerCase())) {
      featureTargets.add(feature.id.toLowerCase());
    }
    if (!genericShallowTerms.has(feature.name.toLowerCase())) {
      featureTargets.add(feature.name.toLowerCase());
    }
    if (feature.tags) {
      feature.tags.forEach(t => {
        if (!genericShallowTerms.has(t.toLowerCase())) {
          featureTargets.add(t.toLowerCase());
        }
      });
    }

    if (featureTargets.size === 0) return false;

    // 1. Check extracted table / ORM model entities against feature targets
    for (const candidate of candidateTables) {
      const lowerCand = candidate.toLowerCase();
      for (const target of featureTargets) {
        if (!target) continue;
        if (lowerCand === target || lowerCand.includes(target) || target.includes(lowerCand)) {
          return true;
        }
      }
    }

    // 2. Check if file is a migration / SQL file and path contains domain feature targets
    const lowerPath = filePath.toLowerCase();
    const isMigrationFile = lowerPath.endsWith('.sql') || lowerPath.includes('migration') || lowerPath.includes('schema');
    if (isMigrationFile) {
      for (const target of featureTargets) {
        if (target && lowerPath.includes(target)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Compute feature association score for a modified file against a feature definition.
   */
  public calculateScore(
    filePath: string,
    feature: FeatureDefinition,
    graph: DependencyGraph,
    providedTags?: string[],
    dbSchemaContext?: { tables?: string[]; models?: string[] },
    providedTables?: string[]
  ): FeatureAssociationScore {
    const fanOut = graph.getFanOut(filePath);
    const pathMatchInfo = this.isPathMatch(filePath, feature);
    const hasTag = this.hasExplicitTag(providedTags, feature);
    const schemaMatch = this.hasSchemaMatch(filePath, feature, dbSchemaContext, providedTables);
    
    // Explicit tag (+50), explicit path declaration, or valid schema entity match bypasses dampening
    const bypassedDampening = hasTag || pathMatchInfo.isExplicit || schemaMatch;

    // 1. Tag Score
    const explicitTagScore = hasTag ? this.config.baseExplicitTagScore : 0;

    // 2. Path Depth Weighting & Schema Match Score Boost
    let pathDepthWeight = 1.0;
    if (this.isShallowSharedPath(filePath)) {
      pathDepthWeight = bypassedDampening ? 1.0 : this.config.shallowPathWeight;
    }
    let basePathMatch = pathMatchInfo.matches ? this.config.basePathMatchScore : 0;
    if (!basePathMatch && schemaMatch) {
      basePathMatch = this.config.basePathMatchScore;
    }
    const effectivePathMatchScore = basePathMatch * pathDepthWeight;

    // 3. Import Relationship Score & Fan-out Dampening
    // Check if the feature contains files that import this filePath, or if this file imports feature files
    let isImportedByFeature = false;
    const graphNode = graph.getNode(filePath);
    if (graphNode) {
      for (const importingFile of graphNode.importingFiles) {
        if (this.isPathMatch(importingFile, feature).matches) {
          isImportedByFeature = true;
          break;
        }
      }
    }

    const baseImportScore = isImportedByFeature ? this.config.baseImportScore : 0;
    let fanOutDampeningFactor = 1.0;

    if (isImportedByFeature) {
      if (!bypassedDampening && fanOut > this.config.fanOutThreshold) {
        // Logarithmic fan-out dampening: 1 / log2(fan_out + 1)
        fanOutDampeningFactor = 1 / Math.log2(fanOut + 1);
      } else {
        fanOutDampeningFactor = 1.0;
      }
    }

    const effectiveImportScore = baseImportScore * fanOutDampeningFactor;

    // Total Score
    const totalScore = explicitTagScore + effectivePathMatchScore + effectiveImportScore;

    // Suppression logic based on notification threshold
    const suppressed = totalScore < this.config.notificationThreshold;

    const breakdown: FeatureScoreBreakdown = {
      basePathMatch,
      pathDepthWeight,
      effectivePathMatchScore,
      baseImportScore,
      fanOut,
      fanOutDampeningFactor,
      effectiveImportScore,
      explicitTagScore,
      bypassedDampening,
      totalScore,
    };

    return {
      featureId: feature.id,
      featureName: feature.name,
      score: totalScore,
      suppressed,
      breakdown,
    };
  }
}
