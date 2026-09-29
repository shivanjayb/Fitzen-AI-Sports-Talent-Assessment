# Third-party notices

The motion-analysis engine (`packages/engines/src/motion/`) adapts design ideas from the
projects below. The exercise-config schema (angles → phase bands → form rules), the
sequence-based rep counter with minimum rep time, and the framing/positioning flow follow
react-native-nitro-pose-exercises and fitness-trainer-pose-estimation; the two-threshold
(Schmitt) counter follows Good-GYM. The TypeScript code and the exercise catalogue in this
repository were written for Fitzen.

Pose estimation uses Google MediaPipe Pose Landmarker (Apache-2.0), loaded at runtime.
OpenPose is **not** used: its CMU licence prohibits use in sports applications.

- react-native-nitro-pose-exercises — Copyright (c) 2026 Gautham495 — MIT
- fitness-trainer-pose-estimation — Copyright (c) 2024 Yakup Zengin — MIT
- Good-GYM — Copyright (c) 2024 yo-WASSUP — MIT

## MIT License (applies to each project above)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
