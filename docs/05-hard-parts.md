# Hard Parts & Solutions

## The Proxy Gateway (Networking)

- **The Challenge:** Handling HMR (Hot Module Replacement) and WebSockets through the preview URL.
- **The Solution:** A dedicated **Gateway Worker** that uses `stabilize-session` logic to map subdomains to Sandbox IPs.

## The Global Deployer (Latency, Future)

- **The Challenge:** Users in different regions experience lag fetching from a single R2 bucket.
- **The Solution:** Future multi-region rollout: use **R2 Regional Endpoints** and ensure the Durable Object and Sandbox are co-located in the same data center. MVP remains single-region.

## Resource Reaper (Cost)

- **The Challenge:** Avoiding "Zombie Sandboxes" that burn credits.
- **The Solution:** Out-of-band heartbeats. If the Chat Controller doesn't ping the Sandbox for 60 seconds, the infra kills the container.
