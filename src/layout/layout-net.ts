import { LAYOUT_FEATURE_COUNT } from './layout-features';

/** Встроенные веса MLP (12→64→32→1), обучаются scripts/train-layout-net.py */
import embeddedWeights from './layout-net-weights.json';

type LayerWeights = {
  W: number[][];
  b: number[];
};

type MlpWeights = {
  layers: LayerWeights[];
};

let tfModelPromise: Promise<import('@tensorflow/tfjs').LayersModel | null> | null = null;

function relu(x: number): number {
  return x > 0 ? x : 0;
}

function applyMlp(features: Float32Array, weights: MlpWeights): number {
  let vec = Array.from(features);
  for (let l = 0; l < weights.layers.length; l++) {
    const layer = weights.layers[l]!;
    const out = layer.W.map((row, i) => {
      const sum = row.reduce((acc, w, j) => acc + w * (vec[j] ?? 0), 0);
      return sum + (layer.b[i] ?? 0);
    });
    const isLast = l === weights.layers.length - 1;
    vec = isLast ? out : out.map(relu);
  }
  return vec[0] ?? 0;
}

const fallbackWeights = embeddedWeights as MlpWeights;

/** Синхронный inference (встроенные веса). */
export function predictLayoutDeltas(features: Float32Array[]): Float32Array[] {
  return features.map((f) => {
    const dx = applyMlp(f, fallbackWeights);
    return new Float32Array([dx, 0]);
  });
}

async function loadTfModel(): Promise<import('@tensorflow/tfjs').LayersModel | null> {
  if (tfModelPromise) return tfModelPromise;
  tfModelPromise = (async () => {
    try {
      const tf = await import('@tensorflow/tfjs');
      return await tf.loadLayersModel('/models/layout-net/model.json');
    } catch {
      return null;
    }
  })();
  return tfModelPromise;
}

/** Async inference: TF.js модель при наличии, иначе встроенные веса. */
export async function predictLayoutDeltasAsync(features: Float32Array[]): Promise<Float32Array[]> {
  const model = await loadTfModel();
  if (!model) return predictLayoutDeltas(features);

  try {
    const tf = await import('@tensorflow/tfjs');
    const input = tf.tensor2d(
      features.map((f) => Array.from(f)),
      [features.length, LAYOUT_FEATURE_COUNT],
    );
    const output = model.predict(input) as import('@tensorflow/tfjs').Tensor;
    const data = (await output.data()) as Float32Array;
    input.dispose();
    output.dispose();

    const result: Float32Array[] = [];
    for (let i = 0; i < features.length; i++) {
      result.push(new Float32Array([data[i * 2] ?? 0, 0]));
    }
    return result;
  } catch {
    return predictLayoutDeltas(features);
  }
}

export function preloadLayoutNet(): void {
  void loadTfModel();
}
