---
name: Owner setup confirmation
description: Owner confirmation of the guided Supabase bootstrap and the limits of that confirmation.
---

The guided, owner-run Supabase dashboard setup is a confirmed working approach for this project.

**Why:** The owner reported “that all worked” after guidance covering database installation, administrator account creation, access authorisation, and portal sign-in. They subsequently confirmed that the incremental custom-category SQL upgrade ran successfully.

**How to apply:** Reuse the guided owner setup when needed rather than assuming it remains blocked. These confirmations cover setup, sign-in and successful SQL execution, not live attraction or category mutations; distinguish those operations when reporting verification.

For future catalogue schema extensions, provide an incremental owner-run SQL upgrade that preserves existing attractions and administrator authorisations.

**Why:** The owner has already completed the initial external Supabase setup; extending the catalogue should not require creating or authorising their account again.

**How to apply:** Keep fresh-install setup and existing-installation upgrades compatible, and explain only the additional owner action required.