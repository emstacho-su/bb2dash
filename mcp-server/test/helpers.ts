/** Shared fakes. No test touches the network or needs a key. */

import type { Config } from '../src/config.js';
import type {
  CourseRow,
  MaterialHit,
  MaterialText,
  MaterialsClient,
  SearchRequest,
  SearchResult,
} from '../src/client.js';

export const TEST_URL = 'https://goultdzqcavefcgnifdy.supabase.co';
export const TEST_KEY = 'sb_secret_test_key_not_real';

export function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    supabaseUrl: TEST_URL,
    serviceKey: TEST_KEY,
    timeoutMs: 30_000,
    search: { defaultLimit: 10, maxLimit: 50, minSimilarity: 0.78 },
    ...overrides,
  };
}

export function makeHit(overrides: Partial<MaterialHit> = {}): MaterialHit {
  return {
    fileId: 5,
    textId: 495,
    courseId: 'IST.323',
    bucket: 'lecture_slides',
    fileName: 'Lecture3 -Chap 2- Planning, Policy, and RIsk - Fall2025-rebranded.pptx',
    unitKind: 'slide',
    unitNo: 28,
    score: 0.019607,
    similarity: 0.8912,
    rank: null,
    partNo: null,
    excerpt: 'Risk assessment: identify assets, threats, vulnerabilities, and controls.',
    ...overrides,
  };
}

export function makeText(overrides: Partial<MaterialText> = {}): MaterialText {
  return {
    textId: 495,
    unitKind: 'slide',
    unitNo: 28,
    charCount: 412,
    text: 'Risk assessment: identify assets, threats, vulnerabilities, and controls.\n[notes] Remind them the quiz covers this.',
    file: {
      fileId: 5,
      fileName: 'Lecture3 -Chap 2- Planning, Policy, and RIsk - Fall2025-rebranded.pptx',
      courseId: 'IST.323',
      bucket: 'lecture_slides',
      path: 'Lecture Slides',
    },
    ...overrides,
  };
}

export const COURSES: CourseRow[] = [
  { id: 'ECN.304', title: 'The Economics of Social Issues', kind: 'lecture' },
  { id: 'IST.323', title: 'Intro to Cybersecurity', kind: 'lecture' },
  { id: 'IST.466', title: 'IM&T Capstone', kind: 'lecture' },
];

export class FakeMaterialsClient implements MaterialsClient {
  readonly description = 'fake';
  readonly searchCalls: SearchRequest[] = [];
  readonly textCalls: number[] = [];
  courseCalls = 0;
  floorApplied = true;
  courses: CourseRow[] = COURSES;
  coursesFailure: Error | null = null;

  constructor(
    private readonly hits: MaterialHit[] = [],
    private readonly text: MaterialText | null = null,
    private readonly failure: Error | null = null,
  ) {}

  async search(request: SearchRequest): Promise<SearchResult> {
    this.searchCalls.push(request);
    if (this.failure) throw this.failure;
    let matched = this.hits;
    if (request.course) matched = matched.filter((hit) => hit.courseId === request.course);
    return { hits: matched.slice(0, request.limit), floorApplied: this.floorApplied };
  }

  async getText(textId: number): Promise<MaterialText | null> {
    this.textCalls.push(textId);
    if (this.failure) throw this.failure;
    return this.text && this.text.textId === textId ? this.text : null;
  }

  async listCourses(): Promise<CourseRow[]> {
    this.courseCalls += 1;
    if (this.coursesFailure) throw this.coursesFailure;
    return this.courses;
  }
}

/** Extract the single text block from a tool result. */
export function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((part) => part.text ?? '').join('\n');
}

/** A `fetch` stand-in that records calls and replays scripted responses. */
export interface RecordedCall {
  url: string;
  init: RequestInit;
  body: unknown;
}

export function scriptedFetch(
  responses: Array<{ status: number; body: unknown } | Error>,
): { fetchImpl: typeof fetch; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const queue = [...responses];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const rawBody = init?.body;
    calls.push({ url, init: init ?? {}, body: typeof rawBody === 'string' ? JSON.parse(rawBody) : null });
    const next = queue.shift();
    if (!next) throw new Error(`scriptedFetch: no response scripted for ${url}`);
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body), {
      status: next.status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetchImpl, calls };
}
