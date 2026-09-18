/**
 * The comparison fixtures, in report order. Every one is DUMMY DATA: hand-built
 * to probe one rule, labelled as such in its own file, and never rendered.
 *
 * F01–F11 probe one rule each; F12–F17 are modelled on the scheme shape of each
 * of Stack's six Fall 2026 courses, with invented scores; F18 was added after a
 * review found a shape none of the others reached.
 */

import { fixture as f01 } from './01-weighted-basic';
import { fixture as f02 } from './02-points-scheme';
import { fixture as f03 } from './03-drop-lowest';
import { fixture as f04 } from './04-zero-point-completion';
import { fixture as f05 } from './05-extra-credit';
import { fixture as f06 } from './06-part-wholly-ungraded';
import { fixture as f07 } from './07-unlinked-column';
import { fixture as f08 } from './08-exempt-item';
import { fixture as f09 } from './09-nothing-graded';
import { fixture as f10 } from './10-mixed-point-scales';
import { fixture as f11 } from './11-rank-weighted-exams';
import { fixture as f12 } from './12-shape-ecn304';
import { fixture as f13 } from './13-shape-geo103';
import { fixture as f14 } from './14-shape-ist352';
import { fixture as f15 } from './15-shape-ist323';
import { fixture as f16 } from './16-shape-ist466';
import { fixture as f17 } from './17-shape-ist471';
import { fixture as f18 } from './18-weighted-sub-parts';
import type { ComparisonFixture } from '../types';

export const FIXTURES: readonly ComparisonFixture[] = [
  f01,
  f02,
  f03,
  f04,
  f05,
  f06,
  f07,
  f08,
  f09,
  f10,
  f11,
  f12,
  f13,
  f14,
  f15,
  f16,
  f17,
  f18,
];
