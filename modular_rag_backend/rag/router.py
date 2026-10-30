from .schemas import QueryPlan


class RuleBasedRouter:
    """
    Lightweight query-routing module.

    It decides how the request should enter the retrieval pipeline without
    requiring a second LLM call. More routing strategies can be registered
    later.
    """

    def plan(self, query: str, top_k: int) -> QueryPlan:
        q = query.lower().strip()

        # These are examples of routing signals, not hard requirements.
        if any(x in q for x in ["source", "citation", "page number", "where"]):
            return QueryPlan(
                query=query,
                retrieval_mode="hybrid",
                top_k=top_k,
                reason="source-oriented query",
            )

        if any(x in q for x in ["compare", "difference", "vs", "versus"]):
            return QueryPlan(
                query=query,
                retrieval_mode="dense",
                top_k=max(top_k, 6),
                reason="comparison query; retrieve wider context",
            )

        if any(x in q for x in ["all", "list", "what are the", "which are"]):
            return QueryPlan(
                query=query,
                retrieval_mode="dense",
                top_k=max(top_k, 6),
                reason="list-style query; retrieve wider context",
            )

        return QueryPlan(
            query=query,
            retrieval_mode="hybrid",
            top_k=top_k,
            reason="default hybrid retrieval",
        )


class RouterRegistry:
    def __init__(self):
        self.routers = {"rule_based": RuleBasedRouter()}

    def get(self, name):
        if name not in self.routers:
            raise ValueError(
                f"Unknown router '{name}'. Available: {list(self.routers)}"
            )
        return self.routers[name]
