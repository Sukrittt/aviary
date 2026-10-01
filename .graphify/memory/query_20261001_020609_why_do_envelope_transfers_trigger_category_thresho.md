---
type: "query"
date: "2026-10-01T02:06:09.214Z"
question: "Why do envelope transfers trigger category threshold notifications, and how should it be fixed?"
contributor: "graphify"
source_nodes: ["reconcileThresholdLevels()", "notifyThresholdCrossed()", "thresholdNotifications()", "syncLevel()"]
---

# Q: Why do envelope transfers trigger category threshold notifications, and how should it be fixed?

## Answer

Budget transfers were routed through the same rising-threshold send path as expense writes. The fix makes reconcileThresholdLevels silently synchronize the current level for allocation-only changes, while notifyThresholdCrossed retains send-on-rise behavior for real expense changes. Donor envelopes reaching 90%, 100%, or overspent due only to reduced assignment no longer send notifications, but falling allocation levels still re-arm future expense crossings.

## Source Nodes

- reconcileThresholdLevels()
- notifyThresholdCrossed()
- thresholdNotifications()
- syncLevel()