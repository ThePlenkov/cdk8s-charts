export interface MastraStudioProps {
  namespace: string;
  /** Mastra server service DNS name inside the cluster/compose network. */
  serverHost: string;
  serverPort: number;
  studioPort?: number;
  serviceType?: 'ClusterIP' | 'NodePort' | 'LoadBalancer';
  /** Override the Studio container image (default: node:22-bookworm-slim). */
  image?: string;
}

export interface MastraStudioExports {
  host: string;
  port: number;
  url: string;
}
