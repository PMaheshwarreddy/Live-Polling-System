| Strategy | Hit@1 | Hit@3 | MRR | Paraphrased (Hit@3) | Avg latency | LLM calls / question |
|---|---|---|---|---|---|---|
| vector | 94% | 100% | 0.96 | 100% | 43 ms | 0 |
| **hybrid** (default) | **100%** | **100%** | **1.00** | 100% | 43 ms | 0 |
| hyde | 89–94% | 94–100% | 0.92–0.97 | 88–100% | ~3.0 s | 1 |
| crag | 100% | 100% | 1.00 | 100% | ~9.5 s | 1–2 |
| graph | 83% | 100% | 0.91 | 100% | 47 ms | 0 |

HyDE is shown as a range over two runs, because the hypothetical passage the model writes differs from run to run.
