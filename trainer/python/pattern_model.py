"""
pattern_model.py -- loads a model file made by the Pattern Trainer.

STUDENTS: you do not need to edit this file.

    from pattern_model import PatternModel

    model = PatternModel.load("my_model.json")
    print(model.classes)             # ['cat', 'dog']
    print(model.predict(image))      # {'cat': 0.93, 'dog': 0.07}
    print(model.top(image))          # ('cat', 0.93)

`image` can be a PIL image or a numpy array (Gradio gives you a numpy array).
`predict` returns a dict, which Gradio's Label output shows directly.

Needs: pip install mediapipe pillow   (no TensorFlow)
Keep the image model file (mobilenet_v2_embedder.tflite) in the same folder as this file.
"""

import atexit
import json
import os

import numpy as np

SUPPORTED_VERSION = 1
CHECK_TOLERANCE = 1e-4
IMAGE_PREPROCESS_ID = "mediapipe-image-embedder-centre-crop-v1"
HERE = os.path.dirname(os.path.abspath(__file__))


class ModelFileError(ValueError):
    """Raised with a plain-English message when a model file can't be used."""


# ---------------------------------------------------------------- image side
# MediaPipe turns a picture into numbers, using the same model file as the
# browser trainer. Both sides first take the centre square of the picture
# (no resizing), then MediaPipe resizes it identically on both sides.
# Read photos with Pillow (as below), not mediapipe's own file reader:
# it decodes JPEGs slightly differently from the browser.

def _to_rgb_pixels(image):
    """PIL image or numpy array -> centre square, uint8 RGB (what MediaPipe wants)."""
    from PIL import Image, ImageOps

    if isinstance(image, Image.Image):
        image = ImageOps.exif_transpose(image)   # phone photos: rotate like browsers do
        image = image.convert("RGB")
    a = np.asarray(image)
    if a.ndim == 2:                          # greyscale -> RGB
        a = np.stack([a] * 3, axis=-1)
    a = a[..., :3]                           # drop alpha if present
    if a.dtype != np.uint8:                  # e.g. floats from some libraries
        a = np.clip(a * 255 if a.max() <= 1.0 else a, 0, 255).astype(np.uint8)
    h, w = a.shape[:2]
    s = min(h, w)
    top, left = (h - s) // 2, (w - s) // 2
    return np.ascontiguousarray(a[top:top + s, left:left + s])


_embedders = {}


def _image_embedder(model_file):
    if model_file not in _embedders:
        path = model_file if os.path.isabs(model_file) else os.path.join(HERE, model_file)
        if not os.path.exists(path):
            raise ModelFileError(
                f"Can't find the image model '{model_file}'. It should be in the same "
                "folder as pattern_model.py. Ask your teacher for it.")
        from mediapipe.tasks import python as mp_tasks
        from mediapipe.tasks.python import vision

        options = vision.ImageEmbedderOptions(
            base_options=mp_tasks.BaseOptions(model_asset_path=path),
            l2_normalize=False, quantize=False)
        _embedders[model_file] = vision.ImageEmbedder.create_from_options(options)
    return _embedders[model_file]


@atexit.register
def _close_embedders():
    for e in _embedders.values():
        e.close()
    _embedders.clear()


def _embed_image(image, model_file):
    """Picture -> list of numbers (1280 for MobileNetV2)."""
    import mediapipe as mp

    pixels = mp.Image(image_format=mp.ImageFormat.SRGB, data=_to_rgb_pixels(image))
    result = _image_embedder(model_file).embed(pixels)
    return np.array(result.embeddings[0].embedding, dtype="float32")


# ----------------------------------------------------------------- head side

def _softmax(z):
    z = z - z.max()
    e = np.exp(z)
    return e / e.sum()


ACTIVATIONS = {
    "relu": lambda z: np.maximum(z, 0.0),
    "softmax": _softmax,
    "linear": lambda z: z,
}


def _ramp(dim):
    """Fixed test input used by the self-check. Same formula in the browser."""
    return np.array([((i * 37) % 100) / 100 for i in range(dim)], dtype="float32")


class PatternModel:
    def __init__(self, spec):
        self._check_spec(spec)
        self.spec = spec
        self.classes = list(spec["classes"])
        self.input_type = spec["input"]["type"]
        self._layers = []
        for layer in spec["layers"]:
            k, b = layer["kernel"], layer["bias"]
            self._layers.append((
                np.array(k["data"], dtype="float32").reshape(k["shape"]),
                np.array(b["data"], dtype="float32").reshape(b["shape"]),
                layer["activation"],
            ))
        self._self_test()

    # ---- loading
    @classmethod
    def load(cls, path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                spec = json.load(f)
        except FileNotFoundError:
            raise ModelFileError(
                f"Can't find '{path}'. Is the model file in the same folder as your script?")
        except json.JSONDecodeError:
            raise ModelFileError(
                f"'{path}' isn't a valid model file. Download it again from the Pattern Trainer.")
        return cls(spec)

    @staticmethod
    def _check_spec(spec):
        if spec.get("format") != "pattern-trainer-head":
            raise ModelFileError("This file wasn't made by the Pattern Trainer.")
        if spec.get("version") != SUPPORTED_VERSION:
            raise ModelFileError(
                f"This model file is version {spec.get('version')}, but this starter "
                f"understands version {SUPPORTED_VERSION}. Ask your teacher for the latest starter.")
        inp = spec["input"]
        if inp["type"] == "image":
            if inp.get("preprocess") != IMAGE_PREPROCESS_ID:
                raise ModelFileError(
                    f"This model expects images prepared as '{inp.get('preprocess')}', "
                    "which this starter doesn't know. Ask your teacher for the latest starter.")
        elif inp["type"] == "pose":
            raise ModelFileError("Pose models aren't supported by this starter yet.")
        else:
            raise ModelFileError(f"Unknown input type '{inp['type']}'.")

        width = inp["embedding"]["dim"]
        for i, layer in enumerate(spec["layers"]):
            n_in, n_out = layer["kernel"]["shape"]
            if n_in != width or layer["bias"]["shape"] != [n_out]:
                raise ModelFileError(f"Layer {i + 1} has the wrong shape; the file may be damaged.")
            if len(layer["kernel"]["data"]) != n_in * n_out:
                raise ModelFileError(f"Layer {i + 1} is missing numbers; the file may be damaged.")
            if layer["activation"] not in ACTIVATIONS:
                raise ModelFileError(f"Unknown activation '{layer['activation']}'.")
            width = n_out
        if width != len(spec["classes"]):
            raise ModelFileError("The number of class names doesn't match the model's outputs.")

    def _self_test(self):
        check = self.spec.get("check")
        if not check:
            return
        got = self.predict_embedding(_ramp(self.spec["input"]["embedding"]["dim"]))
        want = np.array(check["output"], dtype="float32")
        if np.abs(np.array(list(got.values())) - want).max() > CHECK_TOLERANCE:
            raise ModelFileError(
                "The model's numbers didn't load correctly (self-check failed). "
                "Download the file again from the Pattern Trainer.")

    # ---- predicting
    def predict_embedding(self, vec):
        x = np.asarray(vec, dtype="float32")
        for kernel, bias, activation in self._layers:
            x = ACTIVATIONS[activation](x @ kernel + bias)
        return {name: float(p) for name, p in zip(self.classes, x)}

    def embed(self, image):
        """The numbers the trained part sees for this picture (for looking inside)."""
        emb = self.spec["input"]["embedding"]
        vec = _embed_image(image, emb["model"])
        if vec.shape[0] != emb["dim"]:
            raise ModelFileError(
                f"The image model gave {vec.shape[0]} numbers but this model file expects "
                f"{emb['dim']}. Check you have the right image model file.")
        return vec

    def predict(self, image):
        return self.predict_embedding(self.embed(image))

    def top(self, image):
        probs = self.predict(image)
        best = max(probs, key=probs.get)
        return best, probs[best]
