// Snapping a dragged part to the grid.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nearestEdge } from "../frontend/src/lab/board.js";

const v = { x0: 0, y0: 0, x1: 4, y1: 3 };

test("a point near a horizontal line snaps to that edge", () => {
  assert.deepEqual(nearestEdge(1.5, 2.1, v), { a: [1, 2], b: [2, 2] });
});

test("a point near a vertical line snaps to that edge", () => {
  assert.deepEqual(nearestEdge(3.05, 0.4, v), { a: [3, 0], b: [3, 1] });
});

test("points past the border stay on the board, and far points are off it", () => {
  assert.deepEqual(nearestEdge(4.4, 1.5, v), { a: [4, 1], b: [4, 2] });
  assert.equal(nearestEdge(-2, 1, v), null);
  assert.equal(nearestEdge(2, 9, v), null);
});
