# RealityOS

**A mobile-first productivity command center built with React Native, Expo, and TypeScript.**

RealityOS brings tasks, side quests, habits, journaling, voice input, progress tracking, and an experimental AI adviser into one dark, terminal-inspired interface.

[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo)](https://expo.dev/)
[![React Native](https://img.shields.io/badge/React%20Native-0.81-61DAFB?logo=react)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)

> **Status: personal prototype / work in progress.** Some AI, Firebase, and native-device functionality needs configuration and security improvements. This is **not** a React/Next.js web application.

## Features

| Module | Purpose |
| --- | --- |
| **Directives** | Manage primary tasks, deadlines, time estimates, and subtasks |
| **Side Quests** | Track optional goals and their subtasks |
| **Habit Matrix** | Group habits by category and check off progress |
| **Cognitive Dump** | Capture thoughts with text or voice-related controls |
| **Captain's Log** | Save journal entries |
| **System Analytics** | View completion metrics and activity history |
| **AI Adviser** | Experiment with a Gemini-powered text/voice assistant |

Additional app behavior includes local notifications, text-to-speech feedback, focus/accountability prompts, local persistence, and an experimental Firebase cloud-sync flow.

## Tech stack

- **App:** React Native, Expo SDK 54, TypeScript
- **Storage:** AsyncStorage (local), Firebase Firestore (optional cloud features)
- **Authentication:** Firebase Authentication integration (requires security refactoring before real use)
- **AI:** Gemini REST API integration (requires a secure server-side proxy before real use)
- **Native APIs:** Expo Notifications, Speech, AV, and File System
- **Build:** Expo Application Services (EAS) configuration

## Repository structure

```text
RealityOS/
├── App.tsx          # App screens, state, and integration code
├── database/db.ts   # Initializes local AsyncStorage data
├── assets/          # App icons and splash assets
├── app.json         # Expo app and native permission settings
├── eas.json         # EAS build profiles
├── index.ts         # Application entry point
├── package.json
└── tsconfig.json
```

## Getting started

### Prerequisites

- Node.js and npm compatible with Expo SDK 54
- An Android emulator, iOS Simulator (macOS), or compatible development device
- A working Expo development environment; native functionality may require a development build

### Run locally

```bash
git clone https://github.com/omkarvighne/RealityOS.git
cd RealityOS
npm ci
npx expo start
```

Then follow Expo's terminal instructions to open the app in your supported environment.

The project also defines:

```bash
npm run android
npm run ios
```

These commands use native Expo run workflows and may require Android Studio or Xcode. A `web` script exists in `package.json`, but the repository is primarily configured as a React Native mobile application; web functionality has not been verified.



## Author

**Omkar Vighne** — [GitHub](https://github.com/omkarvighne) · [Portfolio](https://buildhubstudios.in)

Built as a personal productivity application and portfolio project.
