#!/usr/bin/env python3
"""
Offline training for LayoutNet MLP.
Generates:
  - src/layout/layout-net-weights.json (embedded fallback)
  - public/models/layout-net/model.json (+ weights shards) for TF.js

Requires: pip install numpy tensorflow tensorflowjs
"""

from __future__ import annotations

import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEIGHTS_OUT = ROOT / "src" / "layout" / "layout-net-weights.json"
MODEL_DIR = ROOT / "public" / "models" / "layout-net"

FEATURE_COUNT = 12
HIDDEN1 = 64
HIDDEN2 = 32


def relu(x: float) -> float:
    return max(0.0, x)


def mlp_forward(x: list[float], layers: list[dict]) -> float:
    v = x[:]
    for i, layer in enumerate(layers):
        w = layer["W"]
        b = layer["b"]
        out = [sum(w[j][k] * v[k] for k in range(len(v))) + b[j] for j in range(len(w))]
        v = out if i == len(layers) - 1 else [relu(o) for o in out]
    return v[0]


def random_features() -> list[float]:
    return [random.random() for _ in range(FEATURE_COUNT)]


def golden_delta(features: list[float]) -> float:
    """Synthetic target: center siblings, spread dense clusters."""
    layer = features[0] - 0.5
    sibling = features[1] - 0.5
    density = features[7]
    center = features[8] - 0.5
    dx = sibling * 18 - center * 12 - density * 8 + layer * 4
    return max(-60.0, min(60.0, dx))


def init_layers() -> list[dict]:
    random.seed(42)
    def layer(in_d: int, out_d: int) -> dict:
        return {
            "W": [[random.gauss(0, 0.08) for _ in range(in_d)] for _ in range(out_d)],
            "b": [0.0] * out_d,
        }
    return [layer(FEATURE_COUNT, HIDDEN1), layer(HIDDEN1, HIDDEN2), layer(HIDDEN2, 1)]


def train_numpy(layers: list[dict], samples: int = 4000, lr: float = 0.002) -> None:
    for _ in range(samples):
        x = random_features()
        target = golden_delta(x)
        # numeric grad on output layer only (lightweight)
        pred = mlp_forward(x, layers)
        err = pred - target
        out_layer = layers[-1]
        # backprop simplified: adjust last layer biases/weights
        h2 = mlp_forward_hidden(x, layers)
        for j in range(len(out_layer["W"])):
            out_layer["W"][j][0] = out_layer["W"][j][0] - lr * err * h2[j]
            out_layer["b"][j] = out_layer["b"][j] - lr * err


def mlp_forward_hidden(x: list[float], layers: list[dict]) -> list[float]:
    v = x[:]
    for i, layer in enumerate(layers[:-1]):
        w = layer["W"]
        b = layer["b"]
        out = [sum(w[j][k] * v[k] for k in range(len(v))) + b[j] for j in range(len(w))]
        v = [relu(o) for o in out]
    return v


def export_embedded(layers: list[dict]) -> None:
    WEIGHTS_OUT.parent.mkdir(parents=True, exist_ok=True)
    WEIGHTS_OUT.write_text(json.dumps({"layers": layers}), encoding="utf-8")
    print(f"Wrote {WEIGHTS_OUT}")


def export_tfjs(layers: list[dict]) -> None:
    try:
        import numpy as np
        import tensorflow as tf
    except ImportError:
        print("TensorFlow not installed — skipping TF.js export")
        return

    model = tf.keras.Sequential(
        [
            tf.keras.layers.Input(shape=(FEATURE_COUNT,)),
            tf.keras.layers.Dense(HIDDEN1, activation="relu"),
            tf.keras.layers.Dense(HIDDEN2, activation="relu"),
            tf.keras.layers.Dense(2, activation="linear"),
        ]
    )
    w0, b0 = np.array(layers[0]["W"]), np.array(layers[0]["b"])
    w1, b1 = np.array(layers[1]["W"]), np.array(layers[1]["b"])
    w2 = np.array(layers[2]["W"])
    b2 = np.array([layers[2]["b"][0], 0.0])
    model.layers[0].set_weights([w0.T, b0])
    model.layers[1].set_weights([w1.T, b1])
    model.layers[2].set_weights([w2.T, b2])

    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    try:
        import tensorflowjs as tfjs
        tfjs.converters.save_keras_model(model, str(MODEL_DIR))
        print(f"Wrote TF.js model to {MODEL_DIR}")
    except ImportError:
        model.save(MODEL_DIR / "keras")
        print(f"Wrote Keras model to {MODEL_DIR / 'keras'} (install tensorflowjs to export)")


def main() -> None:
    layers = init_layers()
    train_numpy(layers, samples=6000, lr=0.0015)
    export_embedded(layers)
    export_tfjs(layers)


if __name__ == "__main__":
    main()
