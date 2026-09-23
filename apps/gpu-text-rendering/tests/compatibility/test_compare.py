"""Ensure that comparison detects missing content, inverted colors and broken GDOC round trips."""
import unittest
from PIL import Image, ImageDraw
from compare import compare, check_baseline


class ComparisonTests(unittest.TestCase):
    def test_identical_pages(self):
        page = Image.new('RGB', (64, 64), 'white')
        self.assertEqual(compare(page, page)['meanError'], 0)

    def test_inverted_colors(self):
        result = compare(Image.new('RGB', (64, 64), 'black'), Image.new('RGB', (64, 64), 'white'))
        self.assertEqual(result['tolerantChangedPercent'], 100)

    def test_missing_content_is_not_hidden_by_white_background(self):
        reference = Image.new('RGB', (256, 256), 'white')
        ImageDraw.Draw(reference).rectangle((100, 100, 120, 120), fill='black')
        result = compare(Image.new('RGB', reference.size, 'white'), reference)
        self.assertGreater(result['foregroundChangedPercent'], 90)

    def test_missing_case_fails_baseline(self):
        failures = check_baseline({'cases': []}, {'cases': [{'id': 'required'}]})
        self.assertTrue(failures)

    def test_new_reopen_failure_is_never_accepted(self):
        case = {'id': 'image', 'sha256': 'hash', 'status': 'within-tolerance', 'pages': []}
        failures = check_baseline({'cases': [{**case, 'status': 'reopen-mismatch'}]}, {'cases': [case]})
        self.assertTrue(failures)


if __name__ == '__main__':
    unittest.main()
