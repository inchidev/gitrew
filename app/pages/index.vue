<script setup lang="ts">
const colorMode = useColorMode();
const providers = [
  {
    id: "github",
    name: "GitHub",
    state: "GitHub first",
    title: "Your GitHub organization becomes your workspace.",
    description:
      "Sign in with GitHub. Talk in channels, private groups and DMs, with conversations stored in GitHub Discussions.",
    next: "Next: turn a selected conversation into linked work, hand it to Copilot and follow the result here.",
    boundary:
      "Chat, repository issues and links to Project boards are available. Conversation handoffs and Copilot task execution are planned.",
    icon: "i-octicon-mark-github-16",
  },
  {
    id: "gitea",
    name: "Gitea",
    state: "Next",
    title: "A home for the crew on your own Gitea.",
    description:
      "Keep your code on the lightweight Git server you run. We want the same conversations-to-code workflow for independent teams.",
    next: "First we will prove sign-in, message storage, threads and private access with a small Gitea prototype. A celld and Coolify deployment is part of the self-hosting direction.",
    boundary: "Planned. Gitrew does not connect to Gitea yet.",
    icon: "i-octicon-repo-16",
  },
  {
    id: "gitlab",
    name: "GitLab",
    state: "Later",
    title: "Bring the conversation to your GitLab group.",
    description:
      "Connect a group, projects, issues, merge requests and pipelines, on GitLab.com or your own installation.",
    next: "We will use the GitHub and Gitea work to find the right integration boundaries, then validate GitLab permissions and feature differences.",
    boundary: "Planned. Gitrew does not connect to GitLab yet.",
    icon: "i-octicon-git-pull-request-16",
  },
];
const selected = ref("github");
const active = computed(() =>
  providers.find((provider) => provider.id === selected.value)!,
);
const stages = [
  {
    title: "Talk it through",
    description: "A channel for your team, a thread for the details.",
    status: "Available now",
    icon: "i-octicon-comment-discussion-16",
  },
  {
    title: "Make it work",
    description:
      "Turn selected messages into an issue. Link the repo and Project.",
    status: "Next",
    icon: "i-octicon-issue-opened-16",
  },
  {
    title: "Give it to Copilot",
    description:
      "Review the task and shared context, then follow its progress and PR.",
    status: "Planned",
    icon: "i-octicon-copilot-16",
  },
  {
    title: "See what shipped",
    description:
      "Bring checks, review and the merged result back to the conversation.",
    status: "Planned",
    icon: "i-octicon-git-merge-16",
  },
];
const watchlist = [
  {
    name: "Cursor",
    focus: "Origin & cloud agents",
    description:
      "Following Origin, Cursor’s Git forge in early beta, and how cloud agents turn repository tasks into changes ready for review.",
    href: "https://cursor.com/docs/origin",
  },
  {
    name: "Claude",
    focus: "Coding agents & source control",
    description:
      "Following Claude Code and Anthropic’s Scion research into source control at agent scale. Scion is an internal system, not a public integration.",
    href: "https://www.anthropic.com/engineering/redesigning-source-control",
  },
  {
    name: "Cloudflare",
    focus: "Artifacts, AI Gateway & Sandboxes",
    description:
      "Following programmable Git repositories, model access and isolated coding environments as a possible future agent backend.",
    href: "https://blog.cloudflare.com/next-git-platform-on-cloudflare/",
  },
];
useHead({
  title: "Gitrew — your Git crew",
  meta: [
    {
      name: "description",
      content:
        "A place for the people behind the code. Open-source team chat for GitHub today. Gitea and GitLab are next, with a conversation-to-code workflow on the roadmap.",
    },
  ],
});
</script>

<template>
  <div class="gitrew-landing">
    <header class="site-header">
      <NuxtLink to="/" class="brand" aria-label="Gitrew home"
        ><BrandMark /><span>Gitrew</span></NuxtLink
      >
      <nav aria-label="Main navigation">
        <a href="#providers">Providers</a>
        <a href="#direction">The idea</a>
        <UButton
          to="https://github.com/inchidev/gitrew"
          target="_blank"
          rel="noopener noreferrer"
          icon="i-octicon-mark-github-16"
          color="neutral"
          variant="ghost"
          aria-label="Gitrew source code"
        />
        <UButton
          icon="i-octicon-sun-16"
          aria-label="Toggle color theme"
          color="neutral"
          variant="ghost"
          @click="
            colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
          "
        />
        <UButton
          to="/login"
          label="Sign in"
          color="neutral"
          variant="outline"
        />
      </nav>
    </header>
    <main>
      <section class="hero" aria-labelledby="landing-title">
        <div class="hero-copy">
          <p class="intro-line">
            <UIcon name="i-octicon-git-branch-16" /> Open source. GitHub first.
          </p>
          <h1 id="landing-title">A place for<br />your Git crew.</h1>
          <p class="hero-description">
            Team conversations beside your GitHub repositories. Keep the people,
            decisions and work together.
          </p>
          <div class="hero-actions">
            <UButton
              to="/w/inchidev"
              label="Open Gitrew"
              icon="i-octicon-arrow-right-16"
              trailing
              size="lg"
            /><a href="#providers"
              >Find your Git platform <UIcon name="i-octicon-arrow-down-16"
            /></a>
          </div>
          <p class="hero-note">
            Channels, private groups, DMs and threads today.<br />Browse issues
            and boards. Copilot handoffs come next.
          </p>
        </div>
        <div
          class="crew-scene"
          aria-label="Illustrative preview of a team conversation, not live messages"
        >
          <div class="scene-top">
            <span><BrandMark /> inchidev</span
            ><span class="scene-label">Illustrative preview</span>
          </div>
          <div class="scene-channel">
            <UIcon name="i-octicon-hash-16" /><strong>building</strong
            ><span>The people behind the repos</span>
          </div>
          <div class="scene-message">
            <span class="scene-person">You</span>
            <p>Can we test Gitrew on celld?</p>
            <span class="scene-time">A conversation starts here</span>
          </div>
          <div class="scene-thread">
            <UIcon name="i-octicon-comment-discussion-16" />
            <div>
              <strong>Yes — first, prove the local install.</strong>
              <p>
                Check D1, setup and restart. Share the results in
                inchidev/gitrew.
              </p>
            </div>
          </div>
          <div class="scene-future">
            <UIcon name="i-octicon-git-pull-request-16" />
            <div>
              <span>Where we’re heading</span
              ><strong>Conversation → issue → Copilot → PR</strong>
            </div>
            <span class="scene-label">Planned</span>
          </div>
          <NuxtLink to="/login" class="scene-composer"
            >Join your crew <UIcon name="i-octicon-arrow-right-16"
          /></NuxtLink>
        </div>
      </section>

      <section
        id="providers"
        class="providers-section"
        aria-labelledby="providers-title"
      >
        <div class="section-heading">
          <div>
            <p class="section-kicker">Choose your platform</p>
            <h2 id="providers-title">Same crew. Different Git homes.</h2>
          </div>
          <p>We’re starting with GitHub. Select a provider to see the plan.</p>
        </div>
        <div class="provider-row" role="group" aria-label="Git providers">
          <UButton
            v-for="provider in providers"
            :key="provider.id"
            :icon="provider.icon"
            color="neutral"
            variant="ghost"
            class="provider-button"
            :class="{ 'provider-selected': selected === provider.id }"
            :aria-pressed="selected === provider.id"
            aria-controls="provider-detail"
            @click="selected = provider.id"
            ><span class="provider-name">{{ provider.name }}</span
            ><span class="provider-state">{{ provider.state }}</span
            ><UIcon name="i-octicon-arrow-down-16" class="provider-arrow"
          /></UButton>
        </div>
        <div
          id="provider-detail"
          class="provider-detail"
          aria-live="polite"
          aria-atomic="true"
        >
          <Transition name="provider" mode="out-in"
            ><div :key="active.id" class="provider-content">
              <div>
                <p class="detail-state">{{ active.state }}</p>
                <h3>{{ active.title }}</h3>
                <p>{{ active.description }}</p>
              </div>
              <div class="provider-next">
                <p>{{ active.next }}</p>
                <p class="provider-boundary">
                  <UIcon name="i-octicon-info-16" />{{ active.boundary }}
                </p>
                <NuxtLink v-if="active.id === 'github'" to="/login"
                  >Continue with GitHub
                  <UIcon name="i-octicon-arrow-right-16" /></NuxtLink
                ><a
                  v-else
                  href="https://github.com/inchidev/gitrew/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Follow development <UIcon name="i-octicon-link-external-16"
                /></a>
              </div></div
          ></Transition>
        </div>
      </section>

      <section
        id="direction"
        class="direction-section"
        aria-labelledby="direction-title"
      >
        <div class="section-heading">
          <div>
            <p class="section-kicker">The idea</p>
            <h2 id="direction-title">Give the conversation a way forward.</h2>
          </div>
          <p>
            Gitrew is becoming a place to talk,<br />decide, and follow the work
            to completion.
          </p>
        </div>
        <ol class="workflow">
          <li v-for="stage in stages" :key="stage.title">
            <span class="workflow-status">{{ stage.status }}</span>
            <h3>{{ stage.title }}</h3>
            <p>{{ stage.description }}</p>
          </li>
        </ol>
        <p class="direction-note">
          Your Git platform keeps the development record. Gitrew connects it to
          the conversation. Sharing private context with a repository or agent
          will always be an explicit choice.
        </p>
      </section>

      <section class="watch-section" aria-labelledby="watch-title">
        <div class="section-heading">
          <div>
            <p class="section-kicker">On our radar</p>
            <h2 id="watch-title">Watching where agents take the work.</h2>
          </div>
          <p>Research directions. These are not shipped Gitrew integrations.</p>
        </div>
        <div class="watch-list">
          <a
            v-for="item in watchlist"
            :key="item.name"
            :href="item.href"
            target="_blank"
            rel="noopener noreferrer"
            ><div class="watch-name">
              <h3>{{ item.name }}</h3>
              <UIcon name="i-octicon-link-external-16" />
            </div>
            <p class="watch-focus">{{ item.focus }}</p>
            <p>{{ item.description }}</p></a
          >
        </div>
      </section>

      <section class="ownership-section" aria-labelledby="ownership-title">
        <div>
          <p class="section-kicker">Make room for your crew</p>
          <h2 id="ownership-title">Open source. Your installation.</h2>
          <p>
            Run Gitrew for your own organization. Cloudflare and Vercel are
            supported deployment paths. We’re testing celld locally as the next
            path to self-hosting and Coolify.
          </p>
          <p class="ownership-note">
            Gitrew is free and MIT licensed. Hosting and AI usage are billed by
            the services you choose.
          </p>
        </div>
        <div class="ownership-actions">
          <DeployButtons /><NuxtLink to="/create/"
            >Set up a workspace
            <UIcon name="i-octicon-arrow-right-16" /></NuxtLink
          ><a
            href="https://github.com/inchidev/gitrew/blob/main/docs/celld.md"
            target="_blank"
            rel="noopener noreferrer"
            >celld installation notes <UIcon name="i-octicon-link-external-16"
          /></a>
        </div>
      </section>
    </main>
    <footer class="site-footer">
      <a href="https://inchi.dev" target="_blank" rel="noopener noreferrer"
        >Made by inchi</a
      ><span>Gitrew · your Git crew</span
      ><a
        href="https://github.com/inchidev/gitrew"
        target="_blank"
        rel="noopener noreferrer"
        >Source & roadmap <UIcon name="i-octicon-link-external-16"
      /></a>
    </footer>
  </div>
</template>

<style scoped>
.gitrew-landing {
  max-width: 1240px;
  margin: auto;
  padding: 0 40px;
}
.site-header {
  min-height: 84px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-bottom: 1px solid var(--ui-border);
}
.site-header nav {
  display: flex;
  align-items: center;
  gap: 20px;
}
a {
  text-decoration: none;
}
.site-header nav > a:not(.inline-flex) {
  color: var(--ui-text-muted);
  font-size: 14px;
}
.hero {
  display: grid;
  grid-template-columns: 1fr 1.05fr;
  gap: 70px;
  align-items: center;
  padding: 82px 0 84px;
}
.intro-line {
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--ui-text-muted);
  font-size: 14px;
  margin-bottom: 25px;
}
h1 {
  font-size: clamp(46px, 5.7vw, 76px);
  font-weight: 650;
  line-height: 1.03;
  letter-spacing: -3.4px;
}
.hero-description {
  max-width: 430px;
  color: var(--ui-text-muted);
  font-size: 19px;
  line-height: 1.65;
  margin-top: 26px;
}
.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  align-items: center;
  margin-top: 30px;
}
.hero-actions > a:last-child {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}
.hero-note {
  color: var(--ui-text-muted);
  font-size: 14px;
  line-height: 1.75;
  margin-top: 20px;
}
.crew-scene {
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--ui-bg);
  box-shadow: 8px 8px 0 var(--ui-bg-muted);
}
.scene-top {
  min-height: 58px;
  padding: 14px 22px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
}
.scene-top > span:first-child {
  display: flex;
  align-items: center;
  gap: 9px;
  font-weight: 600;
  font-size: 16px;
}
.scene-top .brand-mark {
  width: 21px;
  height: 21px;
}
.scene-label {
  color: var(--ui-text-muted);
  font-size: 12px;
}
.scene-channel {
  padding: 21px 24px 14px;
  display: flex;
  align-items: center;
  gap: 9px;
  flex-wrap: wrap;
}
.scene-channel > span:last-child {
  flex-basis: 100%;
  margin-left: 25px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.scene-message {
  margin: 8px 24px 0;
  padding: 18px 0;
}
.scene-person {
  font-weight: 650;
}
.scene-message p {
  font-size: 16px;
  line-height: 1.65;
  margin: 5px 0;
}
.scene-time {
  color: var(--ui-text-muted);
  font-size: 12px;
}
.scene-thread {
  margin: 0 24px 22px;
  padding: 14px 0 14px 15px;
  border-left: 2px solid var(--ui-border-accented);
  display: flex;
  align-items: flex-start;
  gap: 10px;
}
.scene-thread > span {
  margin-top: 3px;
  flex-shrink: 0;
}
.scene-thread strong {
  font-size: 14px;
}
.scene-thread p {
  color: var(--ui-text-muted);
  font-size: 14px;
  line-height: 1.7;
  margin-top: 4px;
}
.scene-future {
  display: flex;
  align-items: center;
  gap: 12px;
  border-top: 1px dashed var(--ui-border);
  padding: 19px 24px;
  background: var(--ui-bg-muted);
}
.scene-future > span:first-child {
  font-size: 21px;
  flex-shrink: 0;
}
.scene-future > div {
  flex: 1;
}
.scene-future > div > span {
  display: block;
  color: var(--ui-text-muted);
  font-size: 12px;
  margin-bottom: 4px;
}
.scene-future strong {
  display: block;
  font-size: 12px;
  line-height: 1.7;
}
.scene-composer {
  display: flex;
  justify-content: space-between;
  margin: 18px 24px;
  padding: 12px 14px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  color: var(--ui-text-muted);
  font-size: 14px;
}
section[id] {
  scroll-margin-top: 28px;
}
.providers-section,
.direction-section,
.watch-section {
  padding: 52px 0 62px;
  border-top: 1px solid var(--ui-border);
}
.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 32px;
  margin-bottom: 30px;
}
.section-kicker {
  color: var(--ui-text-muted);
  font-size: 14px;
  margin-bottom: 10px;
}
h2 {
  font-size: clamp(26px, 3vw, 36px);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -1.1px;
}
.section-heading > p {
  font-size: 14px;
  color: var(--ui-text-muted);
  line-height: 1.75;
  flex-shrink: 0;
}
.provider-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.provider-button {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  min-height: 81px;
  border: 1px solid var(--ui-border);
  border-radius: 7px;
  text-align: left;
  flex-wrap: wrap;
}
.provider-button.provider-selected {
  background: var(--ui-bg-muted);
  border-color: var(--ui-text);
  box-shadow: inset 0 -3px 0 var(--ui-text);
}
.provider-name {
  font-size: 18px;
  font-weight: 600;
}
.provider-state {
  font-size: 12px;
  font-weight: 400;
  color: var(--ui-text-muted);
}
.provider-arrow {
  margin-left: auto;
  flex-shrink: 0;
}
.provider-detail {
  margin-top: 16px;
  padding: 32px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  min-height: 250px;
}
.provider-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 55px;
}
.detail-state {
  color: var(--ui-text-muted);
  font-size: 12px;
  margin-bottom: 13px;
}
h3 {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.4px;
}
.provider-content h3 {
  font-size: 25px;
  max-width: 420px;
  margin-bottom: 13px;
}
.provider-content p:not(.detail-state) {
  color: var(--ui-text-muted);
  font-size: 15px;
  line-height: 1.8;
}
.provider-boundary {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  margin-top: 17px;
  font-size: 12px !important;
}
.provider-boundary > span {
  flex-shrink: 0;
  margin-top: 4px;
}
.provider-next > a,
.ownership-actions > a {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 18px;
  font-weight: 500;
  font-size: 14px;
}
.workflow {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 30px;
  margin: 38px 0 30px;
}
.workflow li {
  position: relative;
  border-top: 2px solid var(--ui-border);
  padding-top: 22px;
}
.workflow li > span:first-child {
  font-size: 12px;
  display: block;
  margin-bottom: 10px;
}
.workflow-status {
  display: block;
  color: var(--ui-text-muted);
  font-size: 12px;
  margin-bottom: 7px;
}
.workflow h3 {
  font-size: 18px;
  margin-bottom: 10px;
}
.workflow p,
.direction-note,
.watch-list p,
.ownership-section p {
  color: var(--ui-text-muted);
  font-size: 15px;
  line-height: 1.8;
}
.direction-note {
  max-width: 800px;
  font-size: 14px;
}
.watch-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.watch-list > a {
  display: grid;
  grid-template-columns: 220px 1fr;
  column-gap: 35px;
  padding: 22px 0 0;
  border-top: 1px solid var(--ui-border);
}
.watch-name {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 15px;
}
.watch-focus {
  grid-column: 1;
  font-size: 12px !important;
  margin: 9px 0 14px;
}
.watch-list > a > p:last-child {
  grid-column: 2;
  grid-row: 1 / 3;
}
.ownership-section {
  border-top: 1px solid var(--ui-border);
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 65px;
  padding: 55px 0 65px;
}
.ownership-section h2 {
  margin-bottom: 18px;
}
.ownership-note {
  font-size: 12px !important;
  margin-top: 14px;
}
.ownership-actions {
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.site-footer {
  min-height: 85px;
  border-top: 1px solid var(--ui-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  font-size: 12px;
  color: var(--ui-text-muted);
}
.site-footer a:last-child {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}
@media (prefers-reduced-motion: no-preference) {
  .provider-enter-active,
  .provider-leave-active {
    transition:
      opacity 140ms,
      transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .provider-enter-from {
    opacity: 0;
    transform: translateY(6px);
  }
  .provider-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
}
@media (max-width: 1050px) {
  .hero {
    gap: 35px;
  }
  .provider-button {
    gap: 8px;
    padding: 17px;
  }
  .provider-state {
    flex-basis: 100%;
    margin-left: 28px;
  }
  .provider-arrow {
    display: none;
  }
  .section-heading > p {
    max-width: 230px;
    flex-shrink: 1;
  }
}
@media (max-width: 760px) {
  .gitrew-landing {
    padding: 0 22px;
  }
  .site-header {
    min-height: 72px;
  }
  .site-header nav {
    gap: 8px;
  }
  .site-header nav > a:not(.inline-flex) {
    display: none;
  }
  .hero {
    grid-template-columns: 1fr;
    padding: 45px 0 48px;
    gap: 32px;
  }
  h1 {
    font-size: 54px;
    letter-spacing: -2.4px;
  }
  .hero-description {
    font-size: 17px;
    margin-top: 20px;
  }
  .intro-line {
    margin-bottom: 20px;
  }
  .hero-actions {
    gap: 18px;
  }
  .hero-note {
    margin-top: 17px;
  }
  .scene-top {
    padding: 12px 18px;
  }
  .scene-channel {
    padding: 17px 18px 12px;
  }
  .scene-message {
    margin: 0 18px;
    padding: 12px 0;
  }
  .scene-thread {
    margin: 0 18px 17px;
  }
  .scene-future {
    padding: 16px 18px;
  }
  .scene-composer {
    margin: 15px 18px;
  }
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
    gap: 15px;
    margin-bottom: 24px;
  }
  .section-heading > p {
    max-width: none;
  }
  .section-heading br {
    display: none;
  }
  .providers-section,
  .direction-section,
  .watch-section {
    padding: 38px 0;
  }
  .provider-row {
    gap: 7px;
  }
  .provider-button {
    min-width: 0;
    white-space: normal;
    flex-direction: column;
    align-items: flex-start;
    padding: 13px 10px;
    gap: 8px;
    min-height: 112px;
  }
  .provider-name {
    font-size: 16px;
  }
  .provider-state {
    max-width: 100%;
    min-width: 0;
    flex-basis: auto;
    white-space: normal;
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
  }
  .provider-detail {
    padding: 24px 20px;
    min-height: 400px;
  }
  .provider-content {
    grid-template-columns: 1fr;
    gap: 22px;
  }
  .provider-content h3 {
    font-size: 24px;
  }
  .workflow {
    grid-template-columns: 1fr 1fr;
    gap: 28px 20px;
  }
  .workflow p {
    font-size: 14px;
  }
  .watch-list {
    grid-template-columns: 1fr;
    gap: 23px;
  }
  .watch-list > a {
    display: block;
    padding-top: 20px;
  }
  .watch-focus {
    margin-bottom: 8px;
  }
  .ownership-section {
    grid-template-columns: 1fr;
    gap: 25px;
    padding: 38px 0;
  }
  .site-footer {
    flex-wrap: wrap;
    padding: 25px 0;
    min-height: 100px;
    gap: 14px 20px;
  }
  .site-footer > span {
    order: 3;
    flex-basis: 100%;
  }
}
@media (max-width: 480px) {
  .hero {
    padding-top: 32px;
    gap: 24px;
  }
  h1 {
    font-size: 46px;
  }
  .hero-description {
    font-size: 16px;
  }
}
@media (max-width: 360px) {
  .gitrew-landing {
    padding: 0 16px;
  }
  h1 {
    font-size: 44px;
  }
  .hero-actions {
    align-items: flex-start;
    flex-direction: column;
  }
  .scene-label {
    font-size: 12px;
  }
  .scene-future {
    flex-wrap: wrap;
  }
  .scene-future > .scene-label {
    flex-basis: 100%;
  }
  .provider-button {
    padding: 12px 8px;
  }
}
</style>
