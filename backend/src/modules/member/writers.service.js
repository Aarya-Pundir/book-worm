import { notFound } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";
import * as catalog from "../catalog/catalog.service.js";
import * as repo from "./writers.repository.js";

// My Writers (Phase 7.5, FR-087..FR-090). Owned by the Member module (D1). Writers are existing authors read
// through the Catalog service. Members cannot create, edit or delete writers.

export const isFollowing = (memberId, authorId) => repo.isFollowing(memberId, authorId);

/** Any existing writer, including one with no active books (D5). Unknown writers are 404. */
async function requireWriter(rawId) {
  const author = await catalog.findAuthor(rawId);
  if (!author) throw notFound("Writer not found");
  return author;
}

/** Public writer page data; a signed-in member also learns whether they follow the writer (FR-089). */
export async function getWriter(member, rawId) {
  const author = await catalog.getAuthor(rawId);
  return member ? { ...author, following: await repo.isFollowing(member.id, author.id) } : author;
}

/** Idempotent follow. Returns the writer and whether a new follow was created. */
export async function followWriter(memberId, rawId) {
  const author = await requireWriter(rawId);
  const created = await repo.follow(memberId, author.id);
  if (created) logger.info({ event: "writer.followed", authorId: author.id }, "Writer followed");
  return { created, author: { ...author, following: true } };
}

/** Idempotent unfollow. An unknown writer is 404; a writer who was not followed is fine (FR-087). */
export async function unfollowWriter(memberId, rawId) {
  const author = await requireWriter(rawId);
  if (await repo.unfollow(memberId, author.id)) logger.info({ event: "writer.unfollowed", authorId: author.id }, "Writer unfollowed");
}

/** The member's followed writers, newest follow first, with the number of ACTIVE books (0 is kept, FR-088). */
export async function listFollowedWriters(memberId) {
  const followed = await repo.listFollowed(memberId);
  const authors = await catalog.authorsByIds(followed.map((f) => f.id));
  const byId = new Map(authors.map((a) => [a.id, a]));
  return {
    items: followed.filter((f) => byId.has(f.id)).map((f) => ({ id: f.id, name: byId.get(f.id).name, bookCount: byId.get(f.id).bookCount, followedAt: f.followedAt })),
  };
}
