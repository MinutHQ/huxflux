import { createRoute, Outlet, useNavigate, redirect } from "@tanstack/react-router"
import { SettingsPage } from "@/domains/settings/SettingsPage"
import type { Section } from "@/domains/settings/settings.types"
import { Route as rootRoute } from "./__root"

// /settings — layout route
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: () => <Outlet />,
})

function navigateToSection(navigate: ReturnType<typeof useNavigate>, s: Section) {
  navigate({ to: `/settings/${s}` as string })
}

function makeSettingsProps(navigate: ReturnType<typeof useNavigate>, section: Section, repoId: string | null = null) {
  return {
    onBack: () => navigate({ to: "/" }),
    section,
    repoId,
    onSectionChange: (s: Section) => navigateToSection(navigate, s),
    onRepoChange: (id: string | null) => {
      if (id) {
        navigate({ to: "/settings/repo/$repoId", params: { repoId: id } })
      } else {
        navigateToSection(navigate, section)
      }
    },
  }
}

// /settings/general (index redirects here too)
export const SettingsGeneralRoute = createRoute({
  getParentRoute: () => Route,
  path: "general",
  component: function GeneralPage() {
    return <SettingsPage {...makeSettingsProps(useNavigate(), "general")} />
  },
})

// /settings/ → redirect to /settings/general
export const SettingsIndexRoute = createRoute({
  getParentRoute: () => Route,
  path: "/",
  beforeLoad: () => { throw redirect({ to: "/settings/general" }) },
})

// Section routes
function sectionRoute(section: Section) {
  return createRoute({
    getParentRoute: () => Route,
    path: section,
    component: function SectionPage() {
      return <SettingsPage {...makeSettingsProps(useNavigate(), section)} />
    },
  })
}

export const SettingsModelsRoute = sectionRoute("models")
export const SettingsAppearanceRoute = sectionRoute("appearance")
export const SettingsGitRoute = sectionRoute("git")
export const SettingsGitHubRoute = sectionRoute("github")
export const SettingsReviewRoute = sectionRoute("review")
export const SettingsIntegrationsRoute = sectionRoute("integrations")
export const SettingsServersRoute = sectionRoute("servers")
export const SettingsExperimentalRoute = sectionRoute("experimental")
export const SettingsUpdatesRoute = sectionRoute("updates")

// /settings/repo/$repoId
export const SettingsRepoRoute = createRoute({
  getParentRoute: () => Route,
  path: "repo/$repoId",
  // Remount when repoId changes so RepoSettings internal state resets
  remountDeps: (opts) => opts.params.repoId,
  component: function RepoPage() {
    const { repoId } = SettingsRepoRoute.useParams()
    return <SettingsPage {...makeSettingsProps(useNavigate(), "general", repoId)} />
  },
})

export const settingsChildren = [
  SettingsIndexRoute,
  SettingsGeneralRoute,
  SettingsModelsRoute,
  SettingsAppearanceRoute,
  SettingsGitRoute,
  SettingsGitHubRoute,
  SettingsReviewRoute,
  SettingsIntegrationsRoute,
  SettingsServersRoute,
  SettingsExperimentalRoute,
  SettingsUpdatesRoute,
  SettingsRepoRoute,
]
