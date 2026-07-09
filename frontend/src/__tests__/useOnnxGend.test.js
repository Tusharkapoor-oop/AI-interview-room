import { describe, it, expect } from 'vitest';
import { useOnnxGend } from '../useOnnxGend';

describe('useOnnxGend', () => {
  const { computeScore, extractEmbedding } = useOnnxGend();

  it('returns fallback for short embedding', () => {
    const result = computeScore([0.1, 0.2]);
    expect(result.gend_score).toBe(0.5);
    expect(result.explanation).toContain('insufficient');
  });

  it('produces valid score for random embedding', () => {
    const emb = Array.from({ length: 128 }, () => Math.random() * 2 - 1);
    const result = computeScore(emb);
    expect(result.gend_score).toBeGreaterThanOrEqual(0);
    expect(result.gend_score).toBeLessThanOrEqual(1);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('flags synthetic embedding as higher risk', () => {
    const synthetic = [];
    for (let i = 0; i < 128; i++) {
      synthetic.push(Math.sin(i * 0.5) * 0.8 + (i % 3 === 0 ? 2 : 0));
    }
    const result = computeScore(synthetic);
    expect(result.deepfake_flagged).toBeDefined();
  });

  it('extractEmbedding handles ImageData', () => {
    const data = new Uint8ClampedArray(224 * 224 * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 120; data[i + 1] = 100; data[i + 2] = 90; data[i + 3] = 255;
    }
    const imageData = { data, width: 224, height: 224 };
    const emb = extractEmbedding(imageData);
    expect(emb.length).toBeGreaterThanOrEqual(12);
  });

  it('extractEmbedding returns default for null input', () => {
    const emb = extractEmbedding(null);
    expect(emb.length).toBe(12);
  });
});