import { useEffect, useRef, useState } from "react";
import {
  buildInterviewPrompt,
  checkExtractedFact,
  parseInterviewReply,
  type Fact,
  type FactBank,
  type InterviewMessage,
  type InterviewProposal,
  type InterviewTopic,
  type SkillFact,
} from "@encaixe/core";
import { describeParseError, useLlmTask } from "../generation";
import { useI18n } from "../i18n";
import FactForm from "./FactForm";
import { Errors, factTitle, Modal } from "./ui";

type Turn = InterviewMessage & { proposals?: InterviewProposal[] };
type Status = "added" | "discarded";

export default function InterviewPanel({
  bank,
  topic,
  onAddFacts,
  onClose,
}: {
  bank: FactBank;
  topic: InterviewTopic;
  onAddFacts: (facts: Fact[]) => string[];
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const llm = useLlmTask();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [statuses, setStatuses] = useState<Record<string, Status>>({});
  const [editing, setEditing] = useState<Fact>();
  const [errors, setErrors] = useState<string[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const proposals = turns.flatMap((turn) => turn.proposals ?? []);
  const statusOf = (id: string) => (bank.facts.some((fact) => fact.id === id) ? "added" : statuses[id]);
  const temporaryBank: FactBank = {
    ...bank,
    facts: [
      ...bank.facts,
      ...proposals
        .map((proposal) => proposal.fact)
        .filter((fact) => !bank.facts.some((saved) => saved.id === fact.id)),
    ],
  };
  const skills = new Map<string, SkillFact>();
  for (const fact of temporaryBank.facts) if (fact.kind === "skill") skills.set(fact.id, fact);
  const source = turns
    .filter((turn) => turn.role === "person")
    .map((turn) => turn.text)
    .join("\n");
  function ask(transcript: InterviewMessage[]) {
    llm.run(
      async (callLlm) => {
        const raw = await callLlm(buildInterviewPrompt({ bank, topic, transcript, locale }));
        const result = parseInterviewReply(raw, { bank: temporaryBank, transcript });
        if (!result.ok) {
          const failure = describeParseError(result.error, raw, t);
          llm.setError(failure.key, failure.detail);
          return;
        }
        setTurns((current) => [
          ...current,
          { role: "assistant", text: result.reply, proposals: result.proposals },
        ]);
      },
      { phrases: ["interview.progress.reading", "interview.progress.thinking"] },
    );
  }
  useEffect(() => {
    // Delay until mount settles so StrictMode's cleanup cannot cancel the initial question.
    const timer = setTimeout(() => ask([]), 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns, llm.busy]);
  const fact = topic.kind === "fact" ? bank.facts.find((item) => item.id === topic.factId) : undefined;
  function close() {
    if (
      proposals.some((proposal) => !statusOf(proposal.fact.id)) &&
      !window.confirm(t("interview.closeConfirm"))
    )
      return;
    onClose();
  }
  function send() {
    if (!text.trim() || llm.busy) return;
    const next: Turn[] = [...turns, { role: "person", text: text.trim() }];
    setTurns(next);
    setText("");
    ask(next.map(({ role, text }) => ({ role, text })));
  }
  function confirm(fact: Fact) {
    const dependencies =
      "skillIds" in fact ? fact.skillIds.filter((id) => !bank.facts.some((saved) => saved.id === id)) : [];
    if (dependencies.some((id) => statuses[id] === "discarded")) {
      setErrors([t("interview.discardedSkill")]);
      return;
    }
    const additions = [
      ...proposals
        .filter((proposal) => dependencies.includes(proposal.fact.id))
        .map((proposal) => proposal.fact),
      fact,
    ];
    const issues = onAddFacts(additions);
    setErrors(issues);
    if (!issues.length)
      setStatuses((current) => ({
        ...current,
        ...Object.fromEntries(additions.map((item) => [item.id, "added" as const])),
      }));
  }
  return (
    <Modal
      variant="drawer"
      title={
        topic.kind === "gap"
          ? t("interview.gapTitle", { term: topic.term })
          : t("interview.factTitle", { title: fact ? factTitle(fact) : "" })
      }
      onClose={close}
    >
      <p className="interview-notice text-xs text-muted">{t("interview.notice")}</p>
      <div
        className="interview-messages space-y-4"
        role="log"
        aria-label={t("interview.messages")}
        aria-live="polite"
      >
        {turns.map((turn, index) => (
          <div key={index} className="space-y-3">
            <p
              className={`interview-message ${turn.role === "person" ? "interview-person" : "interview-assistant"}`}
            >
              <span className="sr-only">
                {t(turn.role === "person" ? "interview.person" : "interview.assistant")}:{" "}
              </span>
              {turn.text}
            </p>
            {turn.proposals?.map((proposal) => {
              const { fact, evidence } = proposal;
              const status = statusOf(fact.id);
              const parent =
                "contextId" in fact ? bank.facts.find((item) => item.id === fact.contextId) : undefined;
              const alerts = checkExtractedFact(source, fact, skills);
              return (
                <article className="rounded-xl border border-line p-3 [overflow-wrap:anywhere]" key={fact.id}>
                  <h3 className="font-medium">{factTitle(fact)}</h3>
                  {parent && <p className="mt-1 text-sm text-muted">{factTitle(parent)}</p>}
                  {"skillIds" in fact && fact.skillIds.length > 0 && (
                    <p className="mt-1 text-sm text-muted">
                      {fact.skillIds.map((id) => skills.get(id)?.name ?? id).join(", ")}
                    </p>
                  )}
                  <p className="mt-2 whitespace-pre-wrap text-sm">{t("interview.evidence", { evidence })}</p>
                  {alerts.length > 0 && (
                    <p role="alert" className="mt-2 text-xs text-warn-ink">
                      {t("import.unsupported", {
                        values: [...new Set(alerts.map((alert) => alert.value))].join(", "),
                      })}
                    </p>
                  )}
                  {status ? (
                    <p className="mt-3 text-sm text-muted">
                      {t(status === "added" ? "interview.added" : "import.discarded")}
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="bank-button" onClick={() => confirm(fact)}>
                        {t("import.confirm")}
                      </button>
                      <button type="button" className="bank-button" onClick={() => setEditing(fact)}>
                        {t("editor.edit")}
                      </button>
                      <button
                        type="button"
                        className="bank-button"
                        onClick={() => setStatuses((current) => ({ ...current, [fact.id]: "discarded" }))}
                      >
                        {t("import.discard")}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ))}
        <div ref={end} />
      </div>
      <div className="interview-form mt-4">
        <Errors errors={errors} />
        <form
          className="bank-form"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <label>
            {t("interview.message")}
            <textarea
              rows={3}
              value={text}
              disabled={llm.busy}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  send();
                }
              }}
            />
          </label>
          <button type="submit" className="bank-button" disabled={llm.busy || !text.trim()}>
            {t("interview.send")}
          </button>
        </form>
        <div className="mt-2 flex flex-wrap gap-2">{llm.controls}</div>
      </div>
      {editing && (
        <Modal title={t("editor.editFact")} onClose={() => setEditing(undefined)}>
          <FactForm
            bank={temporaryBank}
            kind={editing.kind}
            fact={editing}
            onCancel={() => setEditing(undefined)}
            onSave={(fact) => {
              setTurns((current) =>
                current.map((turn) => ({
                  ...turn,
                  proposals: turn.proposals?.map((proposal) =>
                    proposal.fact.id === fact.id
                      ? { ...proposal, fact, alerts: checkExtractedFact(source, fact, skills) }
                      : proposal,
                  ),
                })),
              );
              setEditing(undefined);
              return [];
            }}
          />
        </Modal>
      )}
    </Modal>
  );
}
