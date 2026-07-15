/** Contour extraction for silhouette stamp mattes (ported from vectormask). */

export type Point = { x: number; y: number };

/** Douglas-Peucker simplification epsilon (image pixels). */
export const SIMPLIFY_EPSILON = 1.5;

interface Segment {
  p1: Point;
  p2: Point;
}

/**
 * Douglas-Peucker path simplification.
 */
export function douglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIndex = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIndex = i;
    }
  }

  if (maxDist <= epsilon) {
    return [points[0], points[end]];
  }

  const left = douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
  const right = douglasPeucker(points.slice(maxIndex), epsilon);
  return [...left.slice(0, -1), ...right];
}

function perpendicularDistance(p: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const mag = Math.sqrt(dx * dx + dy * dy) || 1e-10;
  const u = ((p.x - lineStart.x) * dx + (p.y - lineStart.y) * dy) / (mag * mag);
  let x: number, y: number;
  if (u < 0) {
    x = lineStart.x;
    y = lineStart.y;
  } else if (u > 1) {
    x = lineEnd.x;
    y = lineEnd.y;
  } else {
    x = lineStart.x + u * dx;
    y = lineStart.y + u * dy;
  }
  return Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2);
}

/**
 * Build a binary mask from image alpha (`alpha > 0` → opaque).
 */
export function imageDataToBinaryMask(imageData: ImageData): {
  mask: Uint8Array;
  width: number;
  height: number;
} {
  const { width, height, data } = imageData;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    mask[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  }
  return { mask, width, height };
}

/**
 * Morphological dilation with a disk kernel of radius `radius`.
 * Expands the canvas by `radius` on each side so growth is not clipped.
 * Islands within ~2R merge; holes shrink by R.
 */
export function dilateMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number
): { mask: Uint8Array; width: number; height: number } {
  const R = Math.max(0, Math.round(radius));
  if (R === 0) {
    return { mask: new Uint8Array(mask), width, height };
  }

  const outW = width + 2 * R;
  const outH = height + 2 * R;
  const out = new Uint8Array(outW * outH);
  const r2 = R * R;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -R; dy <= R; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          if (dx * dx + dy * dy > r2) continue;
          out[(y + R + dy) * outW + (x + R + dx)] = 1;
        }
      }
    }
  }

  return { mask: out, width: outW, height: outH };
}

/**
 * Marching Squares on a binary mask: trace contours along pixel edges.
 * Adds 1px transparent padding so edge contours close.
 * Returned coordinates are in the input mask's pixel space.
 */
export function marchingSquares(
  mask: Uint8Array,
  width: number,
  height: number
): Point[][] {
  const paddedWidth = width + 2;
  const paddedHeight = height + 2;
  const padded = new Uint8Array(paddedWidth * paddedHeight);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      padded[(y + 1) * paddedWidth + (x + 1)] = mask[y * width + x] ? 1 : 0;
    }
  }

  const getMask = (x: number, y: number): number => {
    if (x < 0 || x >= paddedWidth || y < 0 || y >= paddedHeight) return 0;
    return padded[y * paddedWidth + x];
  };

  const segments: Segment[] = [];

  for (let y = 0; y < paddedHeight - 1; y++) {
    for (let x = 0; x < paddedWidth - 1; x++) {
      const tl = getMask(x, y);
      const tr = getMask(x + 1, y);
      const br = getMask(x + 1, y + 1);
      const bl = getMask(x, y + 1);

      const caseIndex = tl * 1 + tr * 2 + br * 4 + bl * 8;

      const top: Point = { x: x + 0.5, y };
      const right: Point = { x: x + 1, y: y + 0.5 };
      const bottom: Point = { x: x + 0.5, y: y + 1 };
      const left: Point = { x, y: y + 0.5 };

      switch (caseIndex) {
        case 0:
        case 15:
          break;
        case 1:
          segments.push({ p1: left, p2: top });
          break;
        case 2:
          segments.push({ p1: top, p2: right });
          break;
        case 3:
          segments.push({ p1: left, p2: right });
          break;
        case 4:
          segments.push({ p1: right, p2: bottom });
          break;
        case 5:
          segments.push({ p1: left, p2: top });
          segments.push({ p1: right, p2: bottom });
          break;
        case 6:
          segments.push({ p1: top, p2: bottom });
          break;
        case 7:
          segments.push({ p1: left, p2: bottom });
          break;
        case 8:
          segments.push({ p1: bottom, p2: left });
          break;
        case 9:
          segments.push({ p1: top, p2: bottom });
          break;
        case 10:
          segments.push({ p1: top, p2: right });
          segments.push({ p1: bottom, p2: left });
          break;
        case 11:
          segments.push({ p1: right, p2: bottom });
          break;
        case 12:
          segments.push({ p1: right, p2: left });
          break;
        case 13:
          segments.push({ p1: top, p2: right });
          break;
        case 14:
          segments.push({ p1: left, p2: top });
          break;
      }
    }
  }

  if (segments.length === 0) {
    return [];
  }

  const contours = connectSegments(segments);

  return contours.map((contour) =>
    contour.map((p) => ({ x: p.x - 1, y: p.y - 1 }))
  );
}

/**
 * Connect line segments into closed contours.
 */
function connectSegments(segments: Segment[]): Point[][] {
  const contours: Point[][] = [];
  const used = new Array(segments.length).fill(false);

  const pointKey = (p: Point): string => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  const pointsEqual = (a: Point, b: Point): boolean =>
    Math.abs(a.x - b.x) < 0.0001 && Math.abs(a.y - b.y) < 0.0001;

  const adjacency = new Map<string, number[]>();
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const k1 = pointKey(seg.p1);
    const k2 = pointKey(seg.p2);
    if (!adjacency.has(k1)) adjacency.set(k1, []);
    if (!adjacency.has(k2)) adjacency.set(k2, []);
    adjacency.get(k1)!.push(i);
    adjacency.get(k2)!.push(i);
  }

  for (let startIdx = 0; startIdx < segments.length; startIdx++) {
    if (used[startIdx]) continue;

    const contour: Point[] = [];
    let currentIdx = startIdx;
    let currentPoint = segments[startIdx].p1;
    contour.push(currentPoint);

    while (true) {
      used[currentIdx] = true;
      const seg = segments[currentIdx];

      const nextPoint = pointsEqual(currentPoint, seg.p1) ? seg.p2 : seg.p1;
      contour.push(nextPoint);

      const key = pointKey(nextPoint);
      const neighbors = adjacency.get(key) || [];
      let nextIdx = -1;
      for (const idx of neighbors) {
        if (!used[idx]) {
          nextIdx = idx;
          break;
        }
      }

      if (nextIdx === -1) {
        break;
      }

      currentIdx = nextIdx;
      currentPoint = nextPoint;
    }

    if (contour.length >= 3) {
      contours.push(contour);
    }
  }

  return contours;
}

/**
 * Dilate opaque regions, trace contours, simplify, and scale into node space.
 * `paddingCanvas` is today's stamp padding in fitted-node pixels.
 * Contours are in emoji-local space (origin = top-left of fitted image).
 */
export function extractStampContours(
  imageData: ImageData,
  nodeWidth: number,
  nodeHeight: number,
  paddingCanvas: number
): Point[][] {
  const { mask, width, height } = imageDataToBinaryMask(imageData);
  const radiusSrc = Math.max(
    1,
    Math.round(paddingCanvas * (width / Math.max(1, nodeWidth)))
  );

  const dilated = dilateMask(mask, width, height, radiusSrc);
  const rawContours = marchingSquares(
    dilated.mask,
    dilated.width,
    dilated.height
  );

  // Dilate expanded canvas by radiusSrc — shift back to original image coords.
  const scaleX = nodeWidth / width;
  const scaleY = nodeHeight / height;

  const paths: Point[][] = [];
  for (const contour of rawContours) {
    const inImageSpace = contour.map((p) => ({
      x: p.x - radiusSrc,
      y: p.y - radiusSrc,
    }));
    const simplified = douglasPeucker(inImageSpace, SIMPLIFY_EPSILON);
    if (simplified.length < 3) continue;
    paths.push(
      simplified.map((p) => ({
        x: p.x * scaleX,
        y: p.y * scaleY,
      }))
    );
  }

  return paths;
}
