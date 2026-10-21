import { describe, expect, it } from "vitest"
import { buildQuestionAnswer, joinMultiSelectAnswer, parseAskAnswers } from "./askAnswers.js"

describe("joinMultiSelectAnswer", () => {
  it("joins labels with a comma and a space", () => {
    expect(joinMultiSelectAnswer(["Red", "Blue"])).toBe("Red, Blue")
  })

  it("appends trimmed free text after the labels", () => {
    expect(joinMultiSelectAnswer(["Red"], "  teal  ")).toBe("Red, teal")
  })

  it("drops blank labels and blank free text", () => {
    expect(joinMultiSelectAnswer(["", "Red"], "   ")).toBe("Red")
  })

  it("quotes a label that contains the separator or a quote", () => {
    expect(joinMultiSelectAnswer(["Red, dark", `Say "hi"`, "Blue"])).toBe(`"Red, dark", "Say \\"hi\\"", Blue`)
  })

  it("returns an empty string when nothing is chosen", () => {
    expect(joinMultiSelectAnswer([])).toBe("")
  })
})

describe("buildQuestionAnswer", () => {
  const options = [{ label: "Red" }, { label: "Blue" }, { label: "Green" }]

  it("sends the chosen label for a single-select question", () => {
    expect(buildQuestionAnswer({ options }, { selected: ["Blue"], other: "" })).toBe("Blue")
  })

  it("sends the trimmed free text when no option is chosen", () => {
    expect(buildQuestionAnswer({ options }, { selected: [], other: "  teal " })).toBe("teal")
  })

  it("sends free text for a question without options", () => {
    expect(buildQuestionAnswer({}, { selected: [], other: "42" })).toBe("42")
  })

  it("orders multi-select labels by option order, not pick order, then adds free text", () => {
    expect(buildQuestionAnswer({ options, multiSelect: true }, { selected: ["Green", "Red"], other: "teal" })).toBe("Red, Green, teal")
  })

  it("ignores picks that are not options", () => {
    expect(buildQuestionAnswer({ options }, { selected: ["Purple"], other: "" })).toBe("")
  })

  it("is empty when nothing is picked or typed", () => {
    expect(buildQuestionAnswer({ options, multiSelect: true }, { selected: [], other: " " })).toBe("")
  })
})

describe("parseAskAnswers", () => {
  const two = [{ question: "Which color?" }, { question: "Which size?" }]

  it("reads one answer per question from the CLI result text", () => {
    const text = `User has answered your questions: "Which color?"="Red", "Which size?"="Large". You can now continue with the user's answers in mind.`
    expect(parseAskAnswers(text, two)).toEqual({ "Which color?": "Red", "Which size?": "Large" })
  })

  it("keeps quotes and commas that appear inside an answer", () => {
    const text = `User has answered your questions: "Which color?"="the "warm" one, please", "Which size?"="L". Continue.`
    expect(parseAskAnswers(text, two)).toEqual({ "Which color?": `the "warm" one, please`, "Which size?": "L" })
  })

  it("reads a multi-select answer as its joined string", () => {
    const text = `User has answered your questions: "Pick"="A, B". You can now continue.`
    expect(parseAskAnswers(text, [{ question: "Pick" }])).toEqual({ Pick: "A, B" })
  })

  it("reads the CLI's current wording", () => {
    const text = `Your questions have been answered: "Which color?"="Red", "Which size?"="L". You can now continue with these answers in mind.`
    expect(parseAskAnswers(text, two)).toEqual({ "Which color?": "Red", "Which size?": "L" })
  })

  it("reads the free-text wording that warns the model to read the answers", () => {
    const text = `The user answered: "Which color?"="none of these, use teal". Read the answers carefully \u2014 they may request changes.`
    expect(parseAskAnswers(text, [{ question: "Which color?" }])).toEqual({ "Which color?": "none of these, use teal" })
  })

  it("leaves out questions the user skipped", () => {
    const text = `Your questions have been answered: "Which size?"="L". You can now continue.`
    expect(parseAskAnswers(text, two)).toEqual({ "Which size?": "L" })
  })

  it("returns null for a denied or errored result", () => {
    expect(parseAskAnswers("Error: Stream closed", two)).toBeNull()
  })

  it("returns null when no question appears in the text", () => {
    expect(parseAskAnswers("The user did not answer the questions.", two)).toBeNull()
  })

  it("returns null when there are no questions", () => {
    expect(parseAskAnswers(`"a"="b"`, [])).toBeNull()
  })
})
