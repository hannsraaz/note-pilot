# Firestore Structure Reference

## Top-Level Collections

### `users`

- One document per authenticated user
- Stores profile and login metadata

### `notes`

- One document per uploaded PDF note
- Stores searchable metadata, counters, and the Firebase Storage file links or legacy Drive links

## Nested Subcollections

### `users/{userId}/savedNotes`

- Stores notes a user bookmarked
- Document ID is the note ID

### `users/{userId}/likedNotes`

- Stores notes a user liked
- Document ID is the note ID

### `notes/{noteId}/comments`

- Stores user discussion under each note

## Query Patterns Used By The App

- Home page trending section uses `notes` ordered by `likeCount desc`, then `downloadCount desc`.
- Home page recent section uses `notes` ordered by `createdAt desc`.
- Browse filters query `notes` by `semester`, `category`, or both.
- Dashboard uploads query `notes` by `uploaderId`, ordered by `createdAt desc`.
- Comments query `notes/{noteId}/comments` ordered by `createdAt desc`.

## Counter Fields

The app keeps denormalized counters on each note document:

- `likeCount`
- `bookmarkCount`
- `commentCount`
- `downloadCount`

These counters allow the UI to render trending cards and engagement details without needing expensive aggregate queries for every screen.
