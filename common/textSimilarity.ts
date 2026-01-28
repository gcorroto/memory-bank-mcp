/**
 * @fileoverview Text Similarity Utilities
 * Provides functions to compare text similarity for task deduplication
 */

/**
 * Calculates Levenshtein distance between two strings
 * (minimum number of single-character edits to transform one string into another)
 */
function levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    
    // Create a 2D array for dynamic programming
    const dp: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
    
    // Initialize base cases
    for (let i = 0; i <= len1; i++) {
        dp[i][0] = i;
    }
    for (let j = 0; j <= len2; j++) {
        dp[0][j] = j;
    }
    
    // Fill the dp table
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,     // deletion
                    dp[i][j - 1] + 1,     // insertion
                    dp[i - 1][j - 1] + 1  // substitution
                );
            }
        }
    }
    
    return dp[len1][len2];
}

/**
 * Calculates similarity score between two strings (0-1 range)
 * 1.0 = identical, 0.0 = completely different
 */
export function textSimilarity(str1: string, str2: string): number {
    if (!str1 && !str2) return 1.0; // Both empty = identical
    if (!str1 || !str2) return 0;   // One empty, one not = different
    
    // Normalize: lowercase, trim, and remove extra spaces
    const s1 = str1.toLowerCase().trim().replace(/\s+/g, ' ');
    const s2 = str2.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // After normalization, check again
    if (s1 === s2) return 1.0;
    if (s1.length === 0 && s2.length === 0) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0;
    
    const maxLen = Math.max(s1.length, s2.length);
    const distance = levenshteinDistance(s1, s2);
    return 1 - (distance / maxLen);
}

/**
 * Checks if two texts are similar based on a threshold
 * @param str1 First string
 * @param str2 Second string
 * @param threshold Similarity threshold (0-1), default 0.8
 * @returns true if similarity >= threshold
 */
export function areSimilar(str1: string, str2: string, threshold: number = 0.8): boolean {
    return textSimilarity(str1, str2) >= threshold;
}

/**
 * Finds the most similar text from a list
 * @param target Target text to compare
 * @param candidates List of candidate texts
 * @param minScore Minimum similarity score to consider (default 0.7)
 * @returns Object with best match and score, or null if no match above threshold
 */
export function findMostSimilar(
    target: string, 
    candidates: string[], 
    minScore: number = 0.7
): { text: string; score: number; index: number } | null {
    if (!target || !candidates || candidates.length === 0) {
        return null;
    }
    
    let bestMatch: { text: string; score: number; index: number } | null = null;
    
    for (let i = 0; i < candidates.length; i++) {
        const score = textSimilarity(target, candidates[i]);
        if (score >= minScore && (!bestMatch || score > bestMatch.score)) {
            bestMatch = { text: candidates[i], score, index: i };
        }
    }
    
    return bestMatch;
}

/**
 * Normalizes a text for comparison (lowercase, trim, remove extra spaces)
 */
export function normalizeText(text: string): string {
    return text.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Checks if text contains all keywords (case-insensitive)
 */
export function containsAllKeywords(text: string, keywords: string[]): boolean {
    const normalized = normalizeText(text);
    return keywords.every(keyword => 
        normalized.includes(normalizeText(keyword))
    );
}
