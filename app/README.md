# App Directory

This directory contains the Next.js App Router entry points and shared styling for PsychDx.

## Route Overview

- `/` (`page.tsx`): Redirects users to the login page.
- `/login`: User sign-in page.
- `/signup`: User registration page.
- `/home`: Main clinical diagnosis workspace.
- `/auth/signout` (POST route): Server-side sign-out endpoint.

## Shared Files

- `layout.tsx`: Defines the root HTML shell and imports global styles.
- `globals.css`: Global UI styles used across all pages.
