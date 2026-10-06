"""Assemble the single-file dashboard: tokens/CSS + markup + plotly (CDN) + embedded JSON + core + app."""
import sys, os, json

here = os.path.dirname(os.path.abspath(__file__))
data_path, out = sys.argv[1], sys.argv[2]
read = lambda p: open(os.path.join(here, p), encoding="utf-8").read()

data = json.load(open(data_path))
blob = json.dumps(data, separators=(",", ":")).replace("</", "<\\/")

html = f"""<title>QuickBite Diner Intelligence</title>
<meta name="description" content="Segments, basket rules and reorder predictions for QuickBite's 480 diners.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800&family=Sora:wght@500;600;700&display=swap">
<style>
{read('dash/style.css')}
</style>
{read('dash/body.html')}
<script src="https://cdnjs.cloudflare.com/ajax/libs/plotly.js/2.35.2/plotly.min.js"></script>
<script id="qb-data" type="application/json">{blob}</script>
<script>
{read('qb_core.js')}
</script>
<script>
{read('dash/app.js')}
</script>
"""
open(out, "w", encoding="utf-8").write(html)
print("wrote", out, f"{os.path.getsize(out)/1024:.0f} KB")
