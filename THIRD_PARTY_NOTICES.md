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

---

## YouTube video lessons

`apps/web/src/app/lessons.ts` lists one public YouTube video per exercise, embedded through
`youtube-nocookie.com` only after the user taps play. The videos belong to their channels
(named on each lesson card); they are not made by, endorsed by or affiliated with Fitzen, SAI,
Khelo India or Fit India. Each ID was confirmed public and embeddable through YouTube oEmbed on
2026-10-13.

---

## Exercise photos

`apps/web/public/exercises/` holds photos of real people doing each exercise, listed in
`apps/web/src/app/photos.ts`. Each exercise page credits its photo. The photos were resized and
cropped; nothing else was changed. The people shown are not affiliated with Fitzen, SAI, Khelo
India or Fit India, and they do not endorse it.

- **free-exercise-db** (https://github.com/yuhonas/free-exercise-db). The dataset is released
  into the public domain under the Unlicense. Its README does not say where the images were
  first taken.
- **Wikimedia Commons**: each file keeps the licence stated on its file page.

  | Exercise | File | Author | Licence |
  |---|---|---|---|
  | Tree, Chair, Cobra, Triangle, Boat, Mountain pose | `Vriksasana_`, `Utkatasana_`, `Bhujangasana_`, `Trikonasana_`, `Paripurna-Navasana_`, `Tadasana_Yoga-Asana_Nina-Mel.jpg` | Kennguru | CC BY 3.0 |
  | Warrior II | `Virabhadrasana_II_-_Warrior_II_Pose.jpg` | lululemon athletica | CC BY 2.0 |
  | Downward dog | `Downward-Facing-Dog.JPG` | Iveto | CC BY 3.0 |
  | Warrior I | `Rocket-yoga-01-4000px.jpg` | Lilian White | CC BY 4.0 |
  | Straight punch | `Frederick_Cornelius_Jab.jpg` | Angria1 | CC BY-SA 3.0 |
  | Sit and reach | `An_art_of_Paschimottanasana_1.JPG` | Thamizhpparithi Maari | CC BY-SA 3.0 |
  | Fast bowling | `Cambridge_University_CC_v_MCC_at_Cambridge,_England_069.jpg` | Acabashi | CC BY-SA 4.0 |
  | Burpee, L-sit, Flamingo balance | `Airborne_Burpee.jpg`, `West_Point_male_gymnast_L-sit.jpg`, `USMC-09294.jpg` | US Marine Corps / West Point Public Affairs | Public domain (US government work) |

  The CC BY-SA files may be shared or adapted only under the same licence.
