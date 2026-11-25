import math
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from movie_splitter import build_split_plan


class SplitPlanTests(unittest.TestCase):
    def test_plan_covers_duration_with_short_final_part(self):
        plan = build_split_plan(130, 60)
        self.assertEqual([part["index"] for part in plan], [1, 2, 3])
        self.assertEqual([part["start_seconds"] for part in plan], [0, 60, 120])
        self.assertEqual([part["duration_seconds"] for part in plan], [60, 60, 10])

    def test_plan_rejects_invalid_duration_and_part_lengths(self):
        for duration in (0, -1, math.inf, math.nan):
            with self.subTest(duration=duration), self.assertRaises(ValueError):
                build_split_plan(duration, 60)
        for segment in (0, 14.9, 3600.1, math.inf):
            with self.subTest(segment=segment), self.assertRaises(ValueError):
                build_split_plan(120, segment)


if __name__ == "__main__":
    unittest.main()
