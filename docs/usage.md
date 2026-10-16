# Using Gitrew

1. Open your workspace domain. Its root opens sign-in or your configured chat directly. You need active GitHub organization membership and, when configured, the allowed GitHub team. Organization and team invitations are managed in GitHub. Missing access opens a checklist with the next action.
2. Pick a channel from the sidebar. Send a message or open its thread to reply. Drafts remain on this device; they are not a persistent offline outbox.
3. Use New conversation for a private group or DM. Workspace administrators manage membership. Adding a workspace member does not add them to existing private conversations.
4. Typing indicators appear under the feed and expire after five seconds. The idle online counter is not shown.
5. Use the bell to follow the current conversation. This requests browser notification permission and requires the installation owner to configure Web Push. The same button disables that conversation's notifications.
6. Use the headphones button to join a voice huddle. Allow microphone access, choose your devices and disconnect when finished. The owner must first configure RealtimeKit or LiveKit. Voice requires access to that conversation.
7. Projects and issues lists source-repository issues/PRs, creates issues and opens GitHub Project boards. Agent execution and automatic conversation handoff are deferred.

Private content is access controlled, not end-to-end encrypted. The backend operator, workspace administrators and GitHub are trusted. Search covers loaded history. Browser support, permission and connectivity affect notifications and audio; no native mobile application is included.

## Your account and workspace

Open **Your account** at the bottom of the sidebar for **Appearance** (System,
Light or Dark), **Check access** and **Sign out**. Appearance stays on this device.
Your GitHub username is your identity; Gitrew does not maintain a separate profile.

Members see the current workspace name as a label. Administrators can open its
menu → **Workspace settings** → **Workspace name**. Changing the display name
preserves the GitHub organization, chat/vault repositories, App and history.
The AfterPrompt installation uses the `inchidev` organization but displays
**AfterPrompt**. There is no repository picker, workspace-creation rail or hosting
promotion in the member interface.

At `/access/`, organization, optional team and chat Read access determine entry.
**Workspace members** is a separate requirement for private channels/DMs; missing
that registration still permits shared channels. Individual private conversations
also require a participant invitation. A failed GitHub check says **Couldn’t verify**,
not that access is missing. After an administrator changes permissions, use
**Check again**. A denied sign-in snapshot rechecks through GitHub authorization.
