import { View, Text, ScrollView } from "react-native"
import { c } from "@/theme"
import { InlineContent } from "./MarkdownInline"

const minColumnWidth = 70
const maxColumnWidth = 240
const cellPadding = 10

export function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(line.trim())
}

export function parseTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "")
  return trimmed.split("|").map((cell) => cell.trim())
}

// Every cell in a column gets the same width so rows line up. The width is a
// rough estimate from the longest cell's visible characters; long cells wrap.
function buildColumnWidths(headerRow: string[], rows: string[][], fontSize: number): number[] {
  return headerRow.map((header, col) => {
    const cells = [header, ...rows.map((row) => row[col] ?? "")]
    const longest = Math.max(...cells.map((cell) => cell.replace(/[*_`~]|\[|\]\([^)]*\)/g, "").length))
    const estimate = longest * fontSize * 0.6 + cellPadding * 2
    return Math.min(maxColumnWidth, Math.max(minColumnWidth, Math.ceil(estimate)))
  })
}

interface TableViewProps {
  headerRow: string[]
  rows: string[][]
  fontSize: number
}

export function TableView({ headerRow, rows, fontSize }: TableViewProps) {
  const widths = buildColumnWidths(headerRow, rows, fontSize)
  const cellStyle = (col: number) => ({
    width: widths[col],
    paddingHorizontal: cellPadding,
    paddingVertical: 6,
    borderRightWidth: col < headerRow.length - 1 ? 1 : 0,
    borderRightColor: c.border,
  })

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 4 }}>
      <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 6, overflow: "hidden" }}>
        <View style={{ flexDirection: "row", backgroundColor: c.secondary }}>
          {headerRow.map((cell, col) => (
            <View key={col} style={cellStyle(col)}>
              <Text style={{ color: c.fgBright, fontSize: fontSize - 1, fontWeight: "700" }}>{cell}</Text>
            </View>
          ))}
        </View>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: c.border }}>
            {headerRow.map((_, col) => (
              <View key={col} style={cellStyle(col)}>
                <InlineContent text={row[col] ?? ""} fontSize={fontSize - 1} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  )
}
