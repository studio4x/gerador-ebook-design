import type { ContentBlock, ProjectSettings } from "../types";
import {
  fetchServerApi,
  isServerApiAvailable,
  isServerApiUnavailableError,
} from "./server-api";

export type SupabaseCloudProject = {
  id: string;
  user_id: string;
  title: string;
  normalized_title: string;
  blocks: ContentBlock[] | string;
  settings: ProjectSettings | string;
  version: number;
  created_at: string;
  updated_at: string;
};

type CloudUser = {
  userId: string;
  email?: string | null;
};

export type CloudProjectPayload = CloudUser & {
  projectId?: string | null;
  title: string;
  normalizedTitle: string;
  blocks?: ContentBlock[];
  settings?: ProjectSettings;
  version?: number;
};

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetchServerApi(input, {
    capability: "cloud",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
  }

  return data as T;
}

export async function listCloudProjects(userId: string): Promise<SupabaseCloudProject[]> {
  const data = await requestJson<{ projects: SupabaseCloudProject[] }>(
    `/api/cloud/projects?userId=${encodeURIComponent(userId)}`
  );
  return data.projects || [];
}

export async function loadCloudProject(userId: string, projectId: string): Promise<SupabaseCloudProject | null> {
  const data = await requestJson<{ project: SupabaseCloudProject | null }>(
    `/api/cloud/projects/${encodeURIComponent(projectId)}?userId=${encodeURIComponent(userId)}`
  );
  return data.project || null;
}

export async function saveCloudProject(payload: CloudProjectPayload): Promise<SupabaseCloudProject> {
  const data = await requestJson<{ project: SupabaseCloudProject }>(`/api/cloud/projects`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data.project;
}

export async function renameCloudProject(input: {
  userId: string;
  projectId: string;
  title: string;
  normalizedTitle: string;
}): Promise<SupabaseCloudProject> {
  const data = await requestJson<{ project: SupabaseCloudProject }>(
    `/api/cloud/projects/${encodeURIComponent(input.projectId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    }
  );
  return data.project;
}

export async function deleteCloudProject(input: { userId: string; projectId: string }): Promise<void> {
  await requestJson<{ success: true }>(
    `/api/cloud/projects/${encodeURIComponent(input.projectId)}?userId=${encodeURIComponent(input.userId)}`,
    { method: "DELETE" }
  );
}

export const isCloudServerApiAvailable = () => isServerApiAvailable("cloud");
export { isServerApiUnavailableError };
