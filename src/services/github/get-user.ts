import { GITHUB_API_BASE_URL, standardHeaders } from "~/lib/api-config"
import { HTTPError } from "~/lib/error"
import { state } from "~/lib/state"
import { githubFetch } from "~/services/github/github-fetch"

export async function getGitHubUser() {
  const response = await githubFetch(`${GITHUB_API_BASE_URL}/user`, {
    headers: {
      authorization: `token ${state.githubToken}`,
      ...standardHeaders(),
    },
  })

  if (!response.ok) throw new HTTPError("Failed to get GitHub user", response)

  return (await response.json()) as GithubUserResponse
}

// Trimmed for the sake of simplicity
interface GithubUserResponse {
  login: string
}
