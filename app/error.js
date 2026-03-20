"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="terminal-root">
      <div className="terminal-noise" />
      <section className="access-card premium-card">
        <p className="eyebrow">Workspace problem</p>
        <h1>We could not open the workspace.</h1>
        <p className="support-copy">
          Please try again. If the problem keeps showing up, sign in again and refresh the live data.
        </p>
        <div className="hero-cta-row">
          <button className="primary-button" onClick={() => reset()}>
            Try again
          </button>
          <Link className="ghost-button" href="/login">
            Sign in
          </Link>
          <Link className="ghost-button" href="/">
            Home
          </Link>
        </div>
      </section>
    </main>
  );
}
