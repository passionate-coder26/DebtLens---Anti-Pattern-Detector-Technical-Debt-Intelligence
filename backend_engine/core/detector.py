def detect_anti_patterns(metrics):
    """
    Applies rules from the books to detect anti-patterns.
    Returns a list of detected issues and a calculated Debt Score.
    """
    detected_patterns = []
    debt_score = 0
    
    loc = metrics['loc']
    methods = metrics['methods']
    complexity = metrics['complexity']

    # --- Rule based on Martin Fowler's Refactoring principles ---

    # 1. Long Method (Weight: 2)
    # [cite_start] Rule: if loc > 50 
    if loc > 200: 
        detected_patterns.append("Long Method / Large File")
        debt_score += 2

    # 2. Large Class (Weight: 3)
    # [cite_start]Rule: methods > 15 
    if methods > 15:
        detected_patterns.append("Large Class")
        debt_score += 3

    # 3. God Class (Weight: 5)
    # [cite_start]Rule: loc > 300 AND methods > 20 
    if loc > 300 and methods > 20:
        detected_patterns.append("God Class")
        debt_score += 5

    # 4. High Complexity (Weight: 4)
    # [cite_start]Rule: Cyclomatic Complexity > 10 
    if complexity > 10:
        detected_patterns.append("High Complexity")
        debt_score += 4

    return detected_patterns, debt_score