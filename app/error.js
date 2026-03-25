"use client";

import Link from "next/link";
import { useEffect } from "react";

const appName = process.env.NEXT_PUBLIC_BLS_APP_NAME || "Allocator Workspace";

export default function Error({ error, reset }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="status-page">
      <div className="status-shell premium-card">
        <p className="landing-kicker">Workspace problem</p>
        <p className="brand-wordmark">{appName}</p>
        <h1>We could not open the workspace.</h1>
        <p className="landing-support">
          Try the workspace again. If the problem persists, sign in again and refresh the live data.
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
      </div>
    </main>
  );
}
