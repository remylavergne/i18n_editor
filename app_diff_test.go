package main

import "testing"

func TestParseDiffToStandardChanges(t *testing.T) {
	app := NewApp()
	diff := `diff --git a/en.json b/en.json
index 1111111..2222222 100644
--- a/en.json
+++ b/en.json
@@ -1,11 +1,12 @@
 {
   "HOME": {
     "MODAL": {
-      "TITLE": "Hello, John!",
+      "TITLE": "Hello, Jane!",
       "SUBTITLE": "Welcome",
-      "DISMISS": "Dismiss"
+      "NEW_CTA": "Continue"
     },
+    "FOOTER": {
+      "COPY": "All rights reserved"
+    }
   }
 }
`

	changes, err := app.ParseDiffToStandardChanges(diff)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(changes) != 4 {
		t.Fatalf("expected 4 changes, got %d", len(changes))
	}

	if changes[0].Action != DiffActionChange ||
		changes[0].Path != "HOME.MODAL.TITLE" ||
		len(changes[0].Segments) != 3 ||
		changes[0].Key != "TITLE" ||
		changes[0].OldValue != "Hello, John!" ||
		changes[0].NewValue != "Hello, Jane!" ||
		changes[0].Source.File != "en.json" ||
		changes[0].Source.Hunk == "" ||
		changes[0].Source.Line == 0 {
		t.Fatalf("unexpected first change: %#v", changes[0])
	}

	if changes[1].Action != DiffActionDelete ||
		changes[1].Path != "HOME.MODAL.DISMISS" ||
		changes[1].Key != "DISMISS" ||
		changes[1].OldValue != "Dismiss" ||
		changes[1].NewValue != "" {
		t.Fatalf("unexpected second change: %#v", changes[1])
	}

	if changes[2].Action != DiffActionAdd ||
		changes[2].Path != "HOME.MODAL.NEW_CTA" ||
		changes[2].Key != "NEW_CTA" ||
		changes[2].OldValue != "" ||
		changes[2].NewValue != "Continue" {
		t.Fatalf("unexpected third change: %#v", changes[2])
	}

	if changes[3].Action != DiffActionAdd ||
		changes[3].Path != "HOME.FOOTER.COPY" ||
		changes[3].Key != "COPY" ||
		changes[3].NewValue != "All rights reserved" {
		t.Fatalf("unexpected fourth change: %#v", changes[3])
	}
}

func TestParseDiffFileCompatibility(t *testing.T) {
	app := NewApp()
	diff := `@@ -1,7 +1,7 @@
 {
   "HOME": {
     "MODAL": {
-      "TITLE": "Hello, John!"
+      "TITLE": "Hello, Jane!"
     }
   }
 }
`

	changes, err := app.ParseDiffFile(diff)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(changes) != 1 {
		t.Fatalf("expected 1 change, got %d", len(changes))
	}

	change := changes[0]
	if change.Type != "modify" ||
		change.Key != "HOME.MODAL.TITLE" ||
		change.OldValue != "Hello, John!" ||
		change.NewValue != "Hello, Jane!" {
		t.Fatalf("unexpected mapped change: %#v", change)
	}
}
