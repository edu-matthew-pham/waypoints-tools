"""
make_image_model.py -- TEACHER ONLY, run once.

Makes mobilenet_v2_embedder.tflite (about 9 MB): the shared "picture to numbers" model,
used by MediaPipe in both the browser trainer and the Python starters.

  * Standard Keras MobileNetV2 (ImageNet weights, no top, average pooled -> 1280 numbers).
  * Takes ordinary 0-255 pixels and does the [-1, 1] scaling inside the model,
    so MediaPipe needs no extra settings and both sides prepare images the same way.

Needs tensorflow + tf_keras on THIS laptop only. Students never need TensorFlow.
Then copy the file into trainer/models/ and into each image starter folder.
"""
import os

import tensorflow as tf
import tf_keras

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mobilenet_v2_embedder.tflite")

base = tf_keras.applications.MobileNetV2(
    input_shape=(224, 224, 3), include_top=False, weights="imagenet", pooling="avg", alpha=1.0)


@tf.function(input_signature=[tf.TensorSpec([1, 224, 224, 3], tf.uint8)])
def embed(pixels):
    return base(tf.cast(pixels, tf.float32) / 127.5 - 1.0)


converter = tf.lite.TFLiteConverter.from_concrete_functions([embed.get_concrete_function()], base)
with open(OUT, "wb") as f:
    f.write(converter.convert())
print(f"Wrote {OUT} ({os.path.getsize(OUT) / 1e6:.1f} MB)")
