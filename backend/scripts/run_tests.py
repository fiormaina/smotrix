import argparse
import os
import sys
import time
import trace
import unittest
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent.parent
TESTS_DIR = ROOT_DIR / "tests"
APP_DIR = ROOT_DIR / "app"


def discover_suite(pattern: str) -> unittest.TestSuite:
    return unittest.defaultTestLoader.discover(
        start_dir=str(TESTS_DIR),
        pattern=pattern,
        top_level_dir=str(ROOT_DIR),
    )


def create_runner(verbosity: int) -> unittest.TextTestRunner:
    return unittest.TextTestRunner(verbosity=verbosity, buffer=True, stream=sys.stdout)


def summarize_result(result: unittest.TestResult, elapsed_seconds: float) -> None:
    failures = len(result.failures)
    errors = len(result.errors)
    skipped = len(result.skipped)
    expected_failures = len(result.expectedFailures)
    unexpected_successes = len(result.unexpectedSuccesses)
    passed = result.testsRun - failures - errors - skipped - expected_failures

    print()
    print(
        "Summary:"
        f" total={result.testsRun}"
        f" passed={passed}"
        f" failed={failures}"
        f" errors={errors}"
        f" skipped={skipped}"
        f" expected_failures={expected_failures}"
        f" unexpected_successes={unexpected_successes}"
        f" duration={elapsed_seconds:.2f}s"
    )


def _normalize_path(path: str | Path) -> str:
    return os.path.normcase(str(Path(path).resolve()))


def print_coverage_report(results: trace.CoverageResults) -> None:
    counts_by_file: dict[str, set[int]] = {}
    for (filename, lineno), count in results.counts.items():
        if count <= 0:
            continue
        normalized_filename = _normalize_path(filename)
        counts_by_file.setdefault(normalized_filename, set()).add(lineno)

    rows: list[tuple[float, int, int, str]] = []
    total_covered = 0
    total_executable = 0

    for path in sorted(APP_DIR.rglob("*.py")):
        executable_lines = set(trace._find_executable_linenos(str(path)))
        if not executable_lines:
            continue

        normalized_path = _normalize_path(path)
        executed_lines = counts_by_file.get(normalized_path, set())
        covered_lines = len(executable_lines & executed_lines)
        total_lines = len(executable_lines)

        total_covered += covered_lines
        total_executable += total_lines
        rows.append(
            (
                covered_lines / total_lines * 100 if total_lines else 100.0,
                covered_lines,
                total_lines,
                path.relative_to(ROOT_DIR).as_posix(),
            )
        )

    print()
    if total_executable == 0:
        print("Coverage: no executable lines found under app/")
        return

    overall_percent = total_covered / total_executable * 100
    print(
        f"Coverage (app/): {overall_percent:.1f}% "
        f"({total_covered}/{total_executable} executable lines)"
    )
    for percent, covered_lines, total_lines, relative_path in sorted(rows, key=lambda row: (row[0], row[3])):
        print(
            f"  {percent:6.1f}%  {covered_lines:4d}/{total_lines:<4d}  {relative_path}"
        )


def cleanup_coverage_artifacts() -> None:
    for path in ROOT_DIR.rglob("*.cover"):
        try:
            path.unlink()
        except FileNotFoundError:
            continue


def run_suite(pattern: str, verbosity: int) -> unittest.TestResult:
    suite = discover_suite(pattern)
    runner = create_runner(verbosity)
    return runner.run(suite)


def main() -> int:
    parser = argparse.ArgumentParser(description="Run backend unit tests with a readable summary.")
    parser.add_argument("--coverage", action="store_true", help="Show a simple coverage summary for app/.")
    parser.add_argument("--pattern", default="test*.py", help="Test file pattern for unittest discovery.")
    parser.add_argument("--verbosity", type=int, default=2, help="unittest verbosity level.")
    args = parser.parse_args()

    os.environ.setdefault("LOG_LEVEL", "WARNING")

    started_at = time.perf_counter()
    if args.coverage:
        tracer = trace.Trace(
            count=True,
            trace=False,
            ignoredirs=[sys.prefix, sys.exec_prefix],
        )
        result = tracer.runfunc(run_suite, args.pattern, args.verbosity)
        coverage_results = tracer.results()
    else:
        result = run_suite(args.pattern, args.verbosity)
        coverage_results = None
    elapsed_seconds = time.perf_counter() - started_at

    summarize_result(result, elapsed_seconds)
    if coverage_results is not None:
        print_coverage_report(coverage_results)
        cleanup_coverage_artifacts()

    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    raise SystemExit(main())
