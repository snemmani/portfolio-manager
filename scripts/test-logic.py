"""Reproducible offline unit, property and mocked-API suite. No live alerts or AI calls."""
import subprocess,pathlib
root=pathlib.Path(__file__).resolve().parents[1]
def run(args):subprocess.run(args,cwd=root,check=True)
node=str(root/'.runner-runtime/bin/node')
def bundle(source,out):run(['./node_modules/esbuild/bin/esbuild',source,'--bundle','--platform=node','--format=esm','--outfile='+out])
for path in sorted((root/'tests').glob('*.test.ts')):
 out='/tmp/arthapalana-'+path.stem+'.mjs';bundle(str(path),out);run([node,out])
for source,out in [('tests/runner-api-entry.ts','runner-api'),('lib/execution.ts','execution'),('lib/alerts.ts','alerts'),('lib/market-handler.ts','market-handler'),('lib/market-review.ts','market-review'),('lib/event-policy.ts','event-policy'),('tests/holding-review-entry.ts','holding-review-api'),('tests/trade-api-entry.ts','trades'),('lib/qualifying-buys.ts','qualifying-buys'),('lib/data.ts','data-integrity'),('tests/reviewed-retention-entry.ts','reviewed-retention')]:bundle(source,'/tmp/arthapalana-'+out+'.mjs')
for name in ['execution-api','rules-execution-api','alerts','runner-api','market-monitor-api','market-review-api','qualifying-buys','technical-refresh','antigravity','trade-api','data-integrity-api','quote-refresh','reviewed-retention','ceiling-ui','profit-ui','business-ui','business-python','holding-label','return-gate-ui','holding-review-api','web-health','d1-sync','r2-sync']:run([node,'tests/'+name+'.test.mjs'])
run([str(root/'.runner-runtime/python/bin/python'),'tests/event-monitor.test.py'])

run([str(root/'.runner-runtime/python/bin/python'),'tests/discovery-pipeline.test.py'])
run([str(root/'.runner-runtime/python/bin/python'),'tests/research-profiles.test.py'])

# Local workerd regression: no external network, AI calls, database writes or alerts.
bundle('tests/request-cache-worker.ts','/tmp/arthapalana-cache-worker.mjs')
run([node,'tests/request-cache-runtime.test.mjs'])

run([node,'tests/market-review-runner.test.mjs'])

# Persistent D1/workerd restart and retry stress test. All providers and portfolios are synthetic.
run([node,'runner/build.mjs'])
bundle('tests/market-review-worker.ts','/tmp/arthapalana-market-review-worker.mjs')
run([node,'tests/market-review-runtime.test.mjs'])

run([node,'tests/research-sources.test.mjs'])

run([node,'tests/research-turn.test.mjs'])

run([node,'tests/annual-reports.test.mjs'])

bundle('lib/annual-documents.ts','/tmp/arthapalana-annual-documents.mjs')
run([node,'tests/annual-reports-api.test.mjs'])
run([node,'tests/report-reader.test.mjs'])

bundle('tests/annual-reports-worker.ts','/tmp/arthapalana-reports-worker.mjs')
run([node,'tests/annual-reports-runtime.test.mjs'])

run([node,'tests/progress-reporter.test.mjs'])

bundle('tests/research-status-worker.ts','/tmp/arthapalana-research-worker.mjs')
run([node,'tests/research-status-runtime.test.mjs'])

run([node,'tests/prepare-documents.test.mjs'])
run([node,'tests/public-documents.test.mjs'])
