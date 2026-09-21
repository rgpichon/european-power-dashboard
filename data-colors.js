/**
 * Data-encoding color system — neutral default; red/green for semantic flags only.
 * UI chrome (tab underline, links, provenance badges) may still use blue/orange in CSS.
 */
(function (global) {
  var DATA = {
    ink: "#111827",
    g2: "#374151",
    g3: "#6B7280",
    g4: "#9CA3AF",
    g5: "#D1D5DB",
    g6: "#F3F4F6",
    paper: "#FFFFFF",
    good: "#16A34A",
    bad: "#DC2626",
    choropleth: [
      [0, "#F9FAFB"],
      [0.24, "#F9FAFB"],
      [0.25, "#D1D5DB"],
      [0.49, "#D1D5DB"],
      [0.5, "#9CA3AF"],
      [0.74, "#9CA3AF"],
      [0.75, "#374151"],
      [1, "#111827"]
    ],
    years: ["#D1D5DB", "#9CA3AF", "#374151"],
    yearsDark: ["#9CA3AF", "#6B7280", "#111827"],
    srmcFill: "rgba(209, 213, 219, 0.35)"
  };

  global.DataColors = DATA;
  if (global.PlotlyTheme) global.PlotlyTheme.data = DATA;
})(typeof window !== "undefined" ? window : this);
