# Kai-Player Modernization Plan

**Date Created:** 2025-10-11
**Current Status:** Codebase Score 8.2/10
**Goal:** Achieve 9.5/10 with comprehensive testing and updated dependencies

---

## Executive Summary

This plan addresses the gaps identified in the October 2025 codebase audit. The primary focus is updating dependencies first to get on latest versions, then adding comprehensive test coverage (currently 0%) to ensure quality and maintainability.

**Critical Context:** NO TYPESCRIPT - All improvements maintain JavaScript-only approach.

---

## Phase 1: Dependency Updates (HIGH PRIORITY) ⚠️

**Timeline:** Week 1
**Goal:** Update major dependencies safely

### Preparation

- [ ] **Create Feature Branch**
  ```bash
  git checkout -b deps/major-updates
  ```
  - **Effort:** 1 minute
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Document Current Versions**
  ```bash
  npm outdated > outdated-$(date +%Y%m%d).txt
  ```
  - **Effort:** 2 minutes
  - **Owner:** TBD
  - **Status:** Not Started

### Minor Updates (Safe)

- [ ] **Update Patch/Minor Versions**
  ```bash
  npm update
  ```
  - Updates within same major version
  - **Effort:** 5 minutes
  - **Risk:** Low
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test After Minor Updates**
  ```bash
  npm run lint
  npm run build:all
  npm run dev
  ```
  - Manual testing of key features (no automated tests yet)
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

### React 18 → 19 (Breaking Changes)

- [ ] **Update React + React-DOM**
  ```bash
  npm install react@latest react-dom@latest
  ```
  - **Effort:** 2 minutes
  - **Risk:** Medium
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Review Breaking Changes**
  - Read React 19 changelog: https://react.dev/blog/2024/12/05/react-19
  - Check for deprecated APIs in codebase
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test React 19 Compatibility**
  - Manual testing of all UI components
  - Test effects panel (complex state)
  - Test library panel (23K songs)
  - Test mixer controls
  - Test WebRTC streaming
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Fix React 19 Issues (if any)**
  - Address any broken components
  - Update hook usage if needed
  - **Effort:** TBD (depends on issues found)
  - **Owner:** TBD
  - **Status:** Not Started

### Vite 5 → 7 (Breaking Changes)

- [ ] **Update Vite + Plugin**
  ```bash
  npm install vite@latest @vitejs/plugin-react@latest
  ```
  - **Effort:** 2 minutes
  - **Risk:** Medium
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Review Vite 7 Migration Guide**
  - https://vite.dev/guide/migration.html
  - Check for config changes
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Update Vite Configs**
  - `src/renderer/vite.config.js`
  - `src/web/vite.config.js`
  - Fix any deprecated options
  - **Effort:** 1 hour
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test Vite 7 Builds**
  - Run `npm run build:all`
  - Test dev mode: `npm run dev`
  - Verify HMR still works
  - Check bundle sizes
  - **Effort:** 1 hour
  - **Owner:** TBD
  - **Status:** Not Started

### Electron Builder 24 → 26

- [ ] **Update electron-builder**
  ```bash
  npm install --save-dev electron-builder@latest
  ```
  - **Effort:** 2 minutes
  - **Risk:** Low
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test Multi-Platform Builds**
  - Linux: `npm run build:linux`
  - Test AppImage launches
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

### Express 4 → 5 (Breaking Changes)

- [ ] **Read Express 5 Migration Guide**
  - https://expressjs.com/en/guide/migrating-5.html
  - Identify breaking changes
  - **Effort:** 20 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Decide: Upgrade or Postpone**
  - Express 5 has middleware changes
  - May affect cookie-session, cors, body-parser
  - **Recommendation:** POSTPONE - not critical
  - **Owner:** TBD
  - **Status:** Not Started

### Merge & Deploy

- [ ] **Run Full Build & Lint**
  ```bash
  npm run lint
  npm run build:all
  ```
  - Manual testing of key features
  - Verify Electron app launches
  - Verify web UI works
  - **Effort:** 20 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Create PR for Review**
  - Document all changes
  - Note any breaking changes
  - Include before/after bundle sizes
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Merge to Main**
  - After review + CI passes
  - **Effort:** 5 minutes
  - **Owner:** TBD
  - **Status:** Not Started

**Phase 1 Success Criteria:**
- ✅ React 19 installed and working
- ✅ Vite 7 installed and working
- ✅ electron-builder 26 builds successfully
- ✅ No regressions in functionality (manual testing since no tests exist yet)

---

## Phase 2: Testing Infrastructure (CRITICAL) 🚨

**Timeline:** Weeks 2-3
**Goal:** Set up testing framework and achieve 30% coverage

### Week 2: Setup & Core Tests

- [ ] **Install Testing Dependencies**
  ```bash
  npm install --save-dev vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom
  ```
  - **Effort:** 15 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Create Vitest Configuration**
  - Create `vitest.config.js` in project root
  - Configure jsdom for React component tests
  - Set up coverage reporting (c8)
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Add Test Scripts to package.json**
  ```json
  {
    "scripts": {
      "test": "vitest",
      "test:ui": "vitest --ui",
      "test:coverage": "vitest --coverage",
      "test:watch": "vitest --watch"
    }
  }
  ```
  - **Effort:** 5 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Write Tests for AppState (State Management)**
  - `src/main/__tests__/appState.test.js`
  - Test queue operations (add/remove/reorder)
  - Test playback state updates
  - Test event emissions (queueChanged, playbackStateChanged)
  - **Target:** 20 tests minimum
  - **Effort:** 4 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Write Tests for PlayerService**
  - `src/shared/services/__tests__/playerService.test.js`
  - Test play/pause/seek logic
  - Test progress calculations
  - Test duration formatting
  - **Target:** 15 tests minimum
  - **Effort:** 3 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Write Tests for QueueService**
  - `src/shared/services/__tests__/queueService.test.js`
  - Test queue manipulation
  - Test current song tracking
  - Test auto-advance logic
  - **Target:** 15 tests minimum
  - **Effort:** 3 hours
  - **Owner:** TBD
  - **Status:** Not Started

### Week 3: More Tests + CI Integration

- [ ] **Write Tests for LibraryService**
  - `src/shared/services/__tests__/libraryService.test.js`
  - Test song filtering (alphabet navigation)
  - Test search functionality
  - Test pagination with 23K+ songs
  - **Target:** 12 tests minimum
  - **Effort:** 3 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Write Tests for MixerService**
  - `src/shared/services/__tests__/mixerService.test.js`
  - Test gain calculations
  - Test mute/solo logic
  - Test stem isolation
  - **Target:** 10 tests minimum
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Write Tests for Authentication**
  - `src/main/__tests__/auth.test.js`
  - Test login flow (bcrypt validation)
  - Test session creation/validation
  - Test logout cleanup
  - **Target:** 8 tests minimum
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Add Tests to CI/CD Pipeline**
  - Update `.github/workflows/build.yml`
  - Add test step before builds
  - Fail builds if tests fail
  - Add coverage reporting
  - **Effort:** 1 hour
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Measure Initial Coverage**
  - Run `npm run test:coverage`
  - Document baseline coverage
  - **Target:** 30% minimum
  - **Effort:** 15 minutes
  - **Owner:** TBD
  - **Status:** Not Started

**Phase 2 Success Criteria:**
- ✅ Vitest configured and working
- ✅ 80+ tests written for core services
- ✅ Tests run in CI/CD
- ✅ Coverage ≥ 30%

---

## Phase 3: Performance Optimization (MEDIUM PRIORITY) 📈

**Timeline:** Week 4
**Goal:** Improve library performance and reduce bundle size

### Virtual Scrolling for Library

- [ ] **Install react-window**
  ```bash
  npm install react-window
  ```
  - **Effort:** 1 minute
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Refactor LibraryPanel.jsx**
  - Replace current list rendering with FixedSizeList
  - Maintain alphabet navigation
  - Preserve pagination logic
  - **Effort:** 4 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test with 23K+ Songs**
  - Verify smooth scrolling
  - Check letter filtering still works
  - Test search performance
  - **Effort:** 1 hour
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Write Tests for Virtual Scrolling**
  - Test scroll position restoration
  - Test item rendering
  - **Effort:** 1 hour
  - **Owner:** TBD
  - **Status:** Not Started

### Code Splitting

- [ ] **Add Lazy Loading to Heavy Components**
  - EffectsPanel.jsx (butterchurn is heavy)
  - MixerPanel.jsx
  - SongEditor.jsx
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Add Loading Fallbacks**
  - Create reusable `<LoadingSpinner />` component
  - Add to Suspense boundaries
  - **Effort:** 1 hour
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Measure Bundle Size Improvement**
  - Before: Document current bundle size
  - After: Compare with code splitting
  - **Target:** 20% reduction in initial bundle
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

### Bundle Analysis

- [ ] **Add Bundle Analyzer**
  ```bash
  npm install --save-dev rollup-plugin-visualizer
  ```
  - Add to vite.config.js
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Identify Heavy Dependencies**
  - Run analyzer
  - Document top 10 largest dependencies
  - Identify optimization opportunities
  - **Effort:** 1 hour
  - **Owner:** TBD
  - **Status:** Not Started

**Phase 3 Success Criteria:**
- ✅ Virtual scrolling smooth with 23K+ songs
- ✅ Code splitting reduces initial bundle by ≥20%
- ✅ Bundle analysis documented

---

## Phase 4: Documentation (MEDIUM PRIORITY) 📚

**Timeline:** Week 5
**Goal:** Improve onboarding and maintainability

### Top-Level Documentation

- [ ] **Create Comprehensive README.md**
  - Project overview
  - Features list
  - Quick start guide
  - Architecture overview (link to existing docs)
  - Development setup
  - Build commands
  - Testing commands
  - **Effort:** 3 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Create CONTRIBUTING.md**
  - Development environment setup
  - Code style guidelines
  - Git workflow (branches, commits)
  - How to write tests
  - How to submit PRs
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Create CHANGELOG.md**
  - Document changes from v1.0.0 forward
  - Use Keep a Changelog format
  - Link to GitHub releases
  - **Effort:** 1 hour
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Create .env.example**
  - Document all available settings
  - Provide sensible defaults
  - Add comments explaining each variable
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

### Developer Experience

- [ ] **Create .vscode/launch.json**
  - Debug configurations for main + renderer
  - Attach to running process config
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Create .vscode/settings.json**
  - ESLint auto-fix on save
  - Prettier as default formatter
  - Format on save enabled
  - **Effort:** 15 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Create .vscode/extensions.json**
  - Recommend ESLint extension
  - Recommend Prettier extension
  - Recommend Vitest extension
  - **Effort:** 10 minutes
  - **Owner:** TBD
  - **Status:** Not Started

### API Documentation

- [ ] **Document IPC Contracts**
  - Create `docs/IPC-API.md`
  - Document all `window.kaiAPI.*` methods
  - Include request/response types
  - Add usage examples
  - **Effort:** 4 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Generate JSDoc HTML**
  - Install jsdoc: `npm install --save-dev jsdoc`
  - Create jsdoc.json config
  - Generate docs: `npm run docs:generate`
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

**Phase 4 Success Criteria:**
- ✅ New contributor can set up dev environment from README
- ✅ All major APIs documented
- ✅ VSCode provides helpful suggestions

---

## Phase 5: Quality Gates (MEDIUM PRIORITY) 🔒

**Timeline:** Week 6
**Goal:** Prevent regressions and enforce quality

### CI/CD Enhancements

- [ ] **Add Lint Step to CI**
  - Update `.github/workflows/build.yml`
  - Run `npm run lint` before build
  - Fail build if lint fails
  - **Effort:** 15 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Add Security Audit to CI**
  - Run `npm audit --audit-level=high`
  - Fail build on high/critical vulnerabilities
  - **Effort:** 15 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Add Coverage Threshold**
  - Configure Vitest to fail if coverage drops below 30%
  - Gradually increase threshold to 60%
  - **Effort:** 15 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Add Bundle Size Tracking**
  - Install bundlesize: `npm install --save-dev bundlesize`
  - Configure max bundle sizes
  - Fail CI if bundle grows >10%
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

### Pre-commit Improvements

- [ ] **Add Test Run to Pre-commit**
  - Update `.husky/pre-commit`
  - Run tests on changed files only
  - **Effort:** 20 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Add Commit Message Linting**
  - Install commitlint: `npm install --save-dev @commitlint/cli @commitlint/config-conventional`
  - Add commit-msg hook
  - Enforce conventional commits
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

**Phase 5 Success Criteria:**
- ✅ CI fails on lint errors
- ✅ CI fails on security vulnerabilities
- ✅ CI fails on coverage drops
- ✅ Pre-commit runs tests

---

## Phase 6: Additional Tests (ONGOING) 🧪

**Timeline:** Weeks 7-12
**Goal:** Achieve 60% coverage

### Component Tests

- [ ] **Test LibraryPanel.jsx**
  - Render with songs
  - Test alphabet filtering
  - Test search
  - Test pagination
  - **Target:** 10 tests
  - **Effort:** 3 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test QueueList.jsx**
  - Render queue
  - Test drag-and-drop reordering
  - Test remove song
  - Test play song from queue
  - **Target:** 8 tests
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test PlayerControls.jsx**
  - Test play/pause toggle
  - Test seek interaction
  - Test volume control
  - **Target:** 6 tests
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test MixerPanel.jsx**
  - Test gain sliders
  - Test mute/solo buttons
  - Test preset loading
  - **Target:** 8 tests
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test EffectsPanel.jsx**
  - Test effect selection
  - Test effect enable/disable
  - Test parameter adjustments
  - **Target:** 6 tests
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

### Integration Tests

- [ ] **Test Queue → Player Flow**
  - Add song to queue
  - Play from queue
  - Verify audio engine receives correct song
  - **Target:** 5 tests
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test Web API → Main Process Flow**
  - POST to /api/request
  - Verify queue updated
  - Verify Socket.IO broadcast
  - **Target:** 8 tests
  - **Effort:** 3 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test State Persistence**
  - Update mixer state
  - Save to disk
  - Reload app
  - Verify state restored
  - **Target:** 6 tests
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

### Coverage Milestone

- [ ] **Achieve 60% Coverage**
  - Run coverage report
  - Identify gaps
  - Write additional tests
  - **Target:** 60% by end of Phase 6
  - **Effort:** Ongoing
  - **Owner:** TBD
  - **Status:** Not Started

**Phase 6 Success Criteria:**
- ✅ 100+ total tests
- ✅ All critical components tested
- ✅ Coverage ≥ 60%

---

## Phase 7: Security Enhancements (NICE TO HAVE) 🔐

**Timeline:** Week 13+
**Goal:** Harden production security

### Rate Limiting

- [ ] **Install express-rate-limit**
  ```bash
  npm install express-rate-limit
  ```
  - **Effort:** 1 minute
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Add Rate Limiting to Login**
  - Limit to 5 attempts per 15 minutes
  - Return 429 Too Many Requests
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Add Rate Limiting to API**
  - Limit song requests to 20/minute per IP
  - Protect admin endpoints
  - **Effort:** 1 hour
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Test Rate Limiting**
  - Verify lockout after 5 failed logins
  - Verify 429 responses
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

### Session Management

- [ ] **Add Session Timeout**
  - Set maxAge: 24 hours
  - Auto-logout after inactivity
  - **Effort:** 15 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Add Session Rotation**
  - Rotate session ID on login
  - Prevents session fixation
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

### HTTPS Support (Optional)

- [ ] **Generate Self-Signed Certificate**
  ```bash
  openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365
  ```
  - **Effort:** 10 minutes
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Add HTTPS Server Option**
  - Add `server.useHttps` setting
  - Load cert files if enabled
  - **Effort:** 2 hours
  - **Owner:** TBD
  - **Status:** Not Started

- [ ] **Document HTTPS Setup**
  - Update docs/wip/SECURITY-MODEL.md
  - Add certificate generation guide
  - **Effort:** 30 minutes
  - **Owner:** TBD
  - **Status:** Not Started

**Phase 7 Success Criteria:**
- ✅ Rate limiting prevents brute force
- ✅ Sessions timeout after 24h
- ✅ HTTPS available as option

---

## Phase 8: Future Enhancements (BACKLOG) 🚀

**Timeline:** TBD
**Goal:** Nice-to-have improvements

### Tooling

- [ ] **Add Storybook**
  - Visual component library
  - Interactive component testing
  - **Effort:** 8 hours
  - **Priority:** Low

- [ ] **Add Docker Dev Container**
  - Containerized dev environment
  - Consistent setup across machines
  - **Effort:** 4 hours
  - **Priority:** Low

### Performance

- [ ] **Add Service Worker**
  - Cache web UI assets
  - Offline support for web admin
  - **Effort:** 6 hours
  - **Priority:** Low

- [ ] **Optimize WebRTC**
  - Measure actual bandwidth usage
  - Fine-tune encoding parameters
  - Add quality presets (low/medium/high)
  - **Effort:** 8 hours
  - **Priority:** Low

### Features

- [ ] **Add Multi-User Support**
  - User accounts (KJ, Assistant, Singer)
  - Role-based permissions
  - Audit log
  - **Effort:** 40 hours
  - **Priority:** Low

- [ ] **Add Remote Library Sync**
  - Cloud backup of song library
  - Multi-device sync
  - **Effort:** 60 hours
  - **Priority:** Low

---

## Metrics & Tracking

### Current Baseline (2025-10-11)

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Test Coverage** | 0% | 60% | 🔴 Critical |
| **Total Tests** | 0 | 100+ | 🔴 Critical |
| **React Version** | 19.2.0 | 19.x | 🟢 Complete |
| **Vite Version** | 7.1.9 | 7.x | 🟢 Complete |
| **ESLint Errors** | 0 | 0 | 🟢 Good |
| **Security Vulns** | 0 | 0 | 🟢 Good |
| **Bundle Size** | TBD | -20% | 🟡 Pending |
| **Docs Coverage** | 40% | 80% | 🟡 Pending |

### Progress Tracking

**Phase 1 (Dependencies):** ⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛ 100% ✅
**Phase 2 (Testing):** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%
**Phase 3 (Performance):** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%
**Phase 4 (Documentation):** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%
**Phase 5 (Quality Gates):** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%
**Phase 6 (More Tests):** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%
**Phase 7 (Security):** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%
**Phase 8 (Future):** ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%

**Overall Progress:** 12.5% (1/8 phases complete)

---

## Weekly Review Checklist

Use this checklist every Friday to track progress:

### Week of ___________

**Completed Tasks:**
- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

**Blockers/Issues:**
- Issue 1: Description
- Issue 2: Description

**Next Week Goals:**
- Goal 1
- Goal 2
- Goal 3

**Coverage Change:**
- Previous: ___%
- Current: ___%
- Delta: +___%

**Dependency Updates:**
- Updated: package@version
- Updated: package@version

**Notes:**
(Free-form notes about challenges, learnings, etc.)

---

## Success Criteria

**Phase 1 Complete When:**
- ✅ React 19 installed
- ✅ Vite 7 installed
- ✅ electron-builder 26 builds successfully
- ✅ No functionality regressions

**Phase 2 Complete When:**
- ✅ 80+ tests written
- ✅ Tests run in CI
- ✅ Coverage ≥ 30%

**Phase 3 Complete When:**
- ✅ Virtual scrolling smooth with 23K songs
- ✅ Bundle size reduced ≥20%

**Phase 4 Complete When:**
- ✅ README comprehensive
- ✅ CONTRIBUTING.md exists
- ✅ API docs complete

**Phase 5 Complete When:**
- ✅ CI runs lint + audit + tests
- ✅ Pre-commit runs tests

**Phase 6 Complete When:**
- ✅ 100+ total tests
- ✅ Coverage ≥ 60%

**Phase 7 Complete When:**
- ✅ Rate limiting implemented
- ✅ Session timeout implemented

**Phase 8:**
- ✅ Backlog items as prioritized

---

## Resources

### Documentation Links
- React 19 Changelog: https://react.dev/blog/2024/12/05/react-19
- Vite 7 Migration: https://vite.dev/guide/migration.html
- Vitest Guide: https://vitest.dev/guide/
- Testing Library: https://testing-library.com/docs/react-testing-library/intro/
- Express 5 Migration: https://expressjs.com/en/guide/migrating-5.html

### Internal Docs
- Architecture: `docs/wip/REFACTORING-SUMMARY.md`
- Security: `docs/wip/SECURITY-MODEL.md`
- Web API: `docs/wip/WEB-API-REFERENCE.md`
- KAI Format: `docs/KAI-Play-Spec-v1.0.md`

### Community
- GitHub Issues: (link to your repo)
- Discussions: (link to discussions)

---

## Notes

- **NO TYPESCRIPT:** All updates maintain JavaScript-only approach
- **Backwards Compatibility:** Preserve existing functionality during updates
- **Dependencies First:** Update to latest versions first, then add tests against stable dependencies
- **Test-Driven (Phase 2+):** After Phase 2, write tests BEFORE refactoring
- **Document Everything:** Update docs as you go, not after
- **Review Regularly:** Weekly check-ins to track progress

---

**Last Updated:** 2025-10-11
**Next Review:** 2025-10-18

**Change Log:**
- 2025-10-11: Initial creation
- 2025-10-11: Reordered phases - Dependency Updates now Phase 1, Testing now Phase 2 (per user request)
- 2025-10-11: ✅ Phase 1 COMPLETED - React 19, Vite 7, electron-builder 26 updated successfully
