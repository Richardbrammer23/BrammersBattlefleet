<!-- working notes, folded into DEBUGGING_REPORT.md -->
- BUG engine test "a human can lose" never reached 'lost' — test fired only 83 misses on 10x10 vs Easy random AI (mean 95 shots). Test design bug; moved to 15x15 Hard. 
- BUG profanity filter bypassed by leetspeak ("sh1t f4ce" accepted) — digits were stripped before matching. Fixed: map 0134578 to letters before matching. Found by API test.
- BUG abandoned game could still be started/played via API — mutateGame checked only the JSON state's phase ('briefing') not the row phase column ('abandoned'). Fixed: lock row, reject phase=abandoned with 409 game_abandoned. Found by API test.
