import { FeatureDefinition, ChangeRadiusAnalysis, ChangeRadiusFileResult, FeatureAssociationScore } from './types.js';
import { DependencyGraph } from './graph.js';
import { ScoringEngine } from './scorer.js';

export class ChangeRadiusAnalyzer {
  private graph: DependencyGraph;
  private scorer: ScoringEngine;
  private features: FeatureDefinition[];

  constructor(graph: DependencyGraph, scorer: ScoringEngine, features: FeatureDefinition[]) {
    this.graph = graph;
    this.scorer = scorer;
    this.features = features;
  }

  /**
   * Evaluates a list of modified files in a PR/changeset against all features.
   */
  public analyze(modifiedFiles: string[], tags?: string[]): ChangeRadiusAnalysis {
    const startTime = performance.now();

    const fileResults: ChangeRadiusFileResult[] = [];
    const activeAssociationsMap: Map<string, FeatureAssociationScore> = new Map();
    const suppressedAssociationsMap: Map<string, FeatureAssociationScore> = new Map();

    for (const filePath of modifiedFiles) {
      const fanOut = this.graph.getFanOut(filePath);
      const associations: FeatureAssociationScore[] = [];

      for (const feature of this.features) {
        const scoreResult = this.scorer.calculateScore(filePath, feature, this.graph, tags);
        
        // Only include non-zero scoring or relevant associations
        if (scoreResult.score > 0) {
          associations.push(scoreResult);

          if (!scoreResult.suppressed) {
            const existing = activeAssociationsMap.get(feature.id);
            if (!existing || scoreResult.score > existing.score) {
              activeAssociationsMap.set(feature.id, scoreResult);
            }
          } else {
            const existing = suppressedAssociationsMap.get(feature.id);
            if (!existing || scoreResult.score > existing.score) {
              suppressedAssociationsMap.set(feature.id, scoreResult);
            }
          }
        }
      }

      fileResults.push({
        filePath,
        fanOut,
        associations,
      });
    }

    // Filter out active associations from suppressed if active exists
    for (const activeKey of activeAssociationsMap.keys()) {
      suppressedAssociationsMap.delete(activeKey);
    }

    const executionTimeMs = performance.now() - startTime;

    return {
      modifiedFiles,
      fileResults,
      activeAssociations: Array.from(activeAssociationsMap.values()),
      suppressedAssociations: Array.from(suppressedAssociationsMap.values()),
      executionTimeMs,
    };
  }
}
