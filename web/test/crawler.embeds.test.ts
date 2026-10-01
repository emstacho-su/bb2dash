/**
 * The crawler's embedded-file parser (`ingest/bb_crawler.js`): which URL it catalogues for a
 * `<a data-bbfile="{…}" href="…">` embed.
 *
 * WHY. A course copied from an earlier term keeps the old copy's ids inside `data-bbfile`.
 * IST.466 item `_12939673_1` ("Major Case #1 - Synchrony") carried `resourceUrl` = the Spring 2026
 * copy (`rid-156013084_1`, which redirects into another course's READ_ONLY area and answers "Not
 * Found or no permission"), while `viewerUrl` and the anchor's own `href` pointed at the current
 * Fall copy (`rid-164409011_1`), which opens. `durableUrl` took `resourceUrl` first, so bb_files 161
 * catalogued the dead copy. The anchor's href (then `viewerUrl`, `permanentUrl`, `resourceUrl`) is
 * what Blackboard itself opens when Stack clicks, so it wins when it is durable.
 *
 * The fixture below has the shape of that embed; every id is real-shaped but the signed query
 * values are made up, and the stored URL must carry no query at all.
 */

import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface EmbeddedFile {
  name: string | null;
  url: string;
  mime: string | null;
  sessionScoped: boolean;
}

const require = createRequire(import.meta.url);
const crawler = require('../../ingest/bb_crawler.js') as {
  durableUrl: (o: Record<string, unknown>, anchorHref?: string | null) => string | null;
  parseBbfile: (html: string | null | undefined, out: EmbeddedFile[]) => EmbeddedFile[];
  bbfileTags: (html: string | null | undefined) => { bbfile: string; href: string | null; tag: string }[];
};

const HOST = 'https://blackboard.syracuse.edu';
const STALE = `${HOST}/bbcswebdav/pid-12939673-dt-content-rid-156013084_1/xid-156013084_1`;
const CURRENT = `${HOST}/bbcswebdav/pid-12939673-dt-content-rid-164409011_1/xid-164409011_1`;

const attr = (o: unknown) =>
  JSON.stringify(o).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

const bbfile = {
  render: 'inline',
  linkName: 'Spring 2026 iSchool Capstone pdf_Synchrony.pdf',
  displayName: 'Spring 2026 iSchool Capstone pdf_Synchrony.pdf',
  mimeType: 'application/pdf',
  resourceUrl: STALE,
  viewerUrl: `${CURRENT}?Kq3cZcYS15=fixturetoken0000&3cCnGYSz89=fixturetoken1111`,
};

describe('durableUrl — the order of preference', () => {
  it('prefers the anchor href, then viewerUrl, over a stale resourceUrl', () => {
    expect(crawler.durableUrl(bbfile, `${CURRENT}?Kq3cZcYS15=x`)).toBe(CURRENT);
    expect(crawler.durableUrl(bbfile, null)).toBe(CURRENT);
  });

  it('uses permanentUrl, then resourceUrl, when nothing earlier is durable', () => {
    const permanent = `${HOST}/bbcswebdav/pid-1-dt-content-rid-7_1/xid-7_1`;
    expect(
      crawler.durableUrl({ resourceUrl: STALE, permanentUrl: permanent, viewerUrl: `${HOST}/sessions/abc/x.pdf` }, '#'),
    ).toBe(permanent);
    expect(crawler.durableUrl({ resourceUrl: STALE }, `${HOST}/sessions/abc/x.pdf`)).toBe(STALE);
  });

  it('never stores a query string', () => {
    expect(crawler.durableUrl({ resourceUrl: `${STALE}?a=1` }, null)).toBe(STALE);
    expect(crawler.durableUrl({}, `${CURRENT}?Kq3cZcYS15=x`)).toBe(CURRENT);
  });

  it('falls back to a non-session URL, then to anything, as before', () => {
    expect(crawler.durableUrl({ resourceUrl: `${HOST}/sessions/s/x.pdf`, permanentUrl: `${HOST}/other/x.pdf` }, null)).toBe(
      `${HOST}/other/x.pdf`,
    );
    expect(crawler.durableUrl({ resourceUrl: `${HOST}/sessions/s/x.pdf` }, null)).toBe(`${HOST}/sessions/s/x.pdf`);
    expect(crawler.durableUrl({}, null)).toBeNull();
  });
});

describe('parseBbfile — the whole <a …> start tag', () => {
  it('catalogues the current copy for the IST.466 Synchrony shape (data-bbfile before href)', () => {
    const html = `<p><a data-bbfile="${attr(bbfile)}" href="${CURRENT}?Kq3cZcYS15=fixturetoken0000&amp;3cCnGYSz89=f">Synchrony</a></p>`;
    expect(crawler.parseBbfile(html, [])).toEqual([
      {
        name: 'Spring 2026 iSchool Capstone pdf_Synchrony.pdf',
        url: CURRENT,
        mime: 'application/pdf',
        sessionScoped: false,
      },
    ]);
  });

  it('reads the href whatever the attribute order and quoting', () => {
    const noViewer = { ...bbfile, viewerUrl: undefined };
    const before = `<a class='x' href='${CURRENT}' target="_blank" data-bbfile="${attr(noViewer)}">a</a>`;
    const after = `<A data-bbfile="${attr(noViewer)}"\n  target=_blank HREF="${CURRENT}">a</A>`;
    expect(crawler.parseBbfile(before, [])[0].url).toBe(CURRENT);
    expect(crawler.parseBbfile(after, [])[0].url).toBe(CURRENT);
  });

  it('keeps an embed with no href, and a data-bbfile on a tag that is not an anchor', () => {
    const noViewer = { ...bbfile, viewerUrl: undefined };
    expect(crawler.parseBbfile(`<a data-bbfile="${attr(noViewer)}">x</a>`, [])[0].url).toBe(STALE);
    expect(crawler.parseBbfile(`<span data-bbfile="${attr(noViewer)}" href="${CURRENT}"></span>`, [])[0].url).toBe(
      STALE,
    );
  });

  it('does not let a ">" inside the JSON end the tag early', () => {
    const tricky = { ...bbfile, viewerUrl: undefined, displayName: 'Cases > Synchrony.pdf' };
    const html = `<a data-bbfile="${JSON.stringify(tricky).replace(/"/g, '&quot;')}" href="${CURRENT}">x</a>`;
    const [file] = crawler.parseBbfile(html, []);
    expect(file.url).toBe(CURRENT);
    expect(file.name).toBe('Cases > Synchrony.pdf');
  });

  it('skips a malformed data-bbfile, de-duplicates by URL, and tolerates null', () => {
    const one = `<a data-bbfile="${attr(bbfile)}" href="${CURRENT}">a</a>`;
    expect(crawler.parseBbfile(`<a data-bbfile="{not json" href="${CURRENT}">x</a>${one}${one}`, [])).toHaveLength(1);
    expect(crawler.parseBbfile(null, [])).toEqual([]);
  });

  it('bbfileTags names the tag and the raw href it found', () => {
    const tags = crawler.bbfileTags(`<a data-bbfile="${attr(bbfile)}" href="${CURRENT}">a</a>`);
    expect(tags).toHaveLength(1);
    expect(tags[0].tag).toBe('a');
    expect(tags[0].href).toBe(CURRENT);
  });
});

describe('durableUrl: a non-http href never beats a data-bbfile URL', () => {
  it('ignores javascript: and relative hrefs when nothing is durable', () => {
    const resource = `${HOST}/courses/1/file.pdf`;
    expect(crawler.durableUrl({ resourceUrl: resource }, 'javascript:void(0)')).toBe(resource);
    expect(crawler.durableUrl({ resourceUrl: resource }, '/ultra/courses/_1_1/outline')).toBe(resource);
  });
});
