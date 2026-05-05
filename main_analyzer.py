# Enhanced AI-Powered Repository Analyzer with Critical Fixes

"""
AI-Powered Repository Analyzer with Comprehensive Analysis
Features: Progress saving, rate limiting, large file handling, configuration support
"""

import os
import ast
import json
import hashlib
import re
from datetime import datetime
from pathlib import Path
import html
import time
import anthropic
import yaml
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, black, white
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas

# Load environment variables if available
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Default Configuration
DEFAULT_CONFIG = {
    'max_file_size_mb': 1,
    'max_lines_per_chunk': 800,
    'chunk_overlap_lines': 100,
    'api_delay_seconds': 1.0,
    'max_retries': 3,
    'retry_delay_seconds': 2,
    'skip_directories': ['node_modules', 'venv', 'env', '__pycache__', '.git', 'dist', 'build', 'target',
                         '.pytest_cache', '.idea', '.next', '.nuxt', '.turbo', 'coverage', '.coverage',
                         '.run-logs', 'reports', 'json_output'],
    'skip_patterns': ['*.min.js', '*.min.css', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
    'priority_extensions': ['.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.cpp', '.c', '.go', '.rs'],
    'supported_extensions': ['.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.cpp', '.c', '.h',
                            '.cs', '.php', '.rb', '.go', '.rs', '.swift', '.kt', '.scala',
                            '.html', '.css', '.scss', '.vue', '.sql', '.yml', '.yaml', '.json',
                            '.toml', '.ini', '.cfg', '.conf', '.sh', '.bash', '.zsh', '.ps1',
                            '.tf', '.tfvars', '.hcl', '.xml', '.gradle', '.properties'],
    'special_filenames': ['Dockerfile', 'docker-compose.yml', 'docker-compose.yaml', 'Jenkinsfile',
                          '.gitlab-ci.yml', '.env', '.env.example', '.env.sample', 'requirements.txt', 'poetry.lock', 'Pipfile',
                          'Pipfile.lock', 'go.mod', 'go.sum', 'pom.xml', 'build.gradle', 'build.gradle.kts'],
    'json_output_dir': 'json_output',
    'reports_dir': 'reports',
    'cache_filename': '.analyzer_cache.json'
}

ANALYZER_VERSION = '2.0'

SEVERITY_ORDER = {'Critical': 0, 'High': 1, 'Medium': 2, 'Low': 3}
FINDING_COLORS = {
    'Critical': '#b71c1c',
    'High': '#d84315',
    'Medium': '#f9a825',
    'Low': '#546e7a'
}
FRONTEND_EXTENSIONS = {'.js', '.jsx', '.ts', '.tsx', '.vue', '.html', '.css', '.scss'}
FRONTEND_METRIC_GUIDE = [
    {
        'label': '* Accuracy',
        'aim': 'Checks whether the UI behaves as intended across rendering, state updates, routing, and data flow.'
    },
    {
        'label': '* Complexity',
        'aim': 'Measures how hard the component or page is to understand, especially when JSX, state, and business logic are tightly coupled.'
    },
    {
        'label': '* Efficiency',
        'aim': 'Looks for runtime issues such as unnecessary rerenders, repeated fetching, expensive render-time work, and poor list handling.'
    },
    {
        'label': '* Maintainability',
        'aim': 'Evaluates how easy the frontend code is to extend safely through reuse, naming clarity, predictable state flow, and modular structure.'
    },
    {
        'label': '* Documentation',
        'aim': 'Evaluates whether component purpose, props, hooks, and shared UI patterns are clear enough for another developer to work with quickly.'
    }
]

KNOWN_VULNERABLE_DEPENDENCIES = {
    'python': {
        'django': {'lt': '3.2.25', 'severity': 'High', 'reason': 'Older Django releases have multiple published security issues.'},
        'flask': {'lt': '2.2.5', 'severity': 'Medium', 'reason': 'Older Flask releases may miss important security hardening fixes.'},
        'pyyaml': {'lt': '6.0', 'severity': 'Medium', 'reason': 'Older PyYAML versions are commonly associated with unsafe-loading risk.'},
        'urllib3': {'lt': '1.26.17', 'severity': 'Medium', 'reason': 'Older urllib3 releases have had multiple security advisories.'}
    },
    'node': {
        'lodash': {'lt': '4.17.21', 'severity': 'High', 'reason': 'Older lodash versions are widely known to contain security vulnerabilities.'},
        'minimist': {'lt': '1.2.6', 'severity': 'High', 'reason': 'Older minimist releases are associated with prototype pollution issues.'},
        'axios': {'lt': '1.6.0', 'severity': 'Medium', 'reason': 'Older axios releases have had multiple published client-side security issues.'},
        'handlebars': {'lt': '4.7.7', 'severity': 'High', 'reason': 'Older handlebars versions are associated with known security issues.'}
    },
    'java': {
        'log4j-core': {'lt': '2.17.1', 'severity': 'Critical', 'reason': 'Older log4j-core versions are associated with critical remote code execution issues.'}
    }
}

class RepositoryAnalyzer:
    def __init__(self, api_key=None, config_file=None):
        """Initialize the analyzer with configuration"""
        try:
            import sys
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass
        self.api_key = api_key or os.environ.get('ANTHROPIC_API_KEY')
        if not self.api_key:
            print("WARNING: ANTHROPIC_API_KEY not set. Running local analysis only.")
        self.client = anthropic.Anthropic(api_key=self.api_key) if self.api_key else None
        
        # Load configuration
        self.config = self.load_config(config_file)
        self.progress_file = '.analyzer_progress.json'
        self.cache_file = self.config['cache_filename']
        self.request_count = 0
        self.last_request_time = 0
        self.json_output_dir = Path(self.config['json_output_dir'])
        self.reports_dir = Path(self.config['reports_dir'])
        self.json_output_dir.mkdir(parents=True, exist_ok=True)
        self.reports_dir.mkdir(parents=True, exist_ok=True)
        
    def load_config(self, config_file):
        """Load configuration from file or use defaults"""
        config = DEFAULT_CONFIG.copy()
        
        if config_file and os.path.exists(config_file):
            try:
                with open(config_file, 'r') as f:
                    user_config = yaml.safe_load(f)
                    config.update(user_config)
                print(f"✅ Loaded configuration from {config_file}")
            except Exception as e:
                print(f"⚠️  Error loading config: {e}. Using defaults.")
        
        return config
    
    def save_progress(self, analyses, repo_name):
        """Save analysis progress to disk"""
        progress_data = {
            'repo_name': repo_name,
            'timestamp': datetime.now().isoformat(),
            'analyses': analyses
        }
        
        try:
            with open(self.progress_file, 'w') as f:
                json.dump(progress_data, f, indent=2)
            print(f"💾 Progress saved ({len(analyses)} files)")
        except Exception as e:
            print(f"⚠️  Could not save progress: {e}")
    
    def load_progress(self, repo_name):
        """Load previous analysis progress"""
        if not os.path.exists(self.progress_file):
            return None
        
        try:
            with open(self.progress_file, 'r') as f:
                progress_data = json.load(f)
            
            if progress_data.get('repo_name') == repo_name:
                print(f"📂 Found previous progress: {len(progress_data['analyses'])} files")
                return progress_data['analyses']
        except Exception as e:
            print(f"⚠️  Could not load progress: {e}")
        
        return None

    def load_analysis_cache(self, repo_name):
        """Load cached per-file analysis data for incremental runs"""
        if not os.path.exists(self.cache_file):
            return {}

        try:
            with open(self.cache_file, 'r', encoding='utf-8') as handle:
                cache_data = json.load(handle)
            if cache_data.get('repo_name') != repo_name:
                return {}
            if cache_data.get('analyzer_version') != ANALYZER_VERSION:
                return {}
            return cache_data.get('files', {})
        except Exception as e:
            print(f"⚠️  Could not load analysis cache: {e}")
            return {}

    def save_analysis_cache(self, repo_name, cache_entries):
        """Persist per-file analysis cache keyed by relative path"""
        payload = {
            'repo_name': repo_name,
            'analyzer_version': ANALYZER_VERSION,
            'generated_at': datetime.now().isoformat(),
            'files': cache_entries
        }
        try:
            with open(self.cache_file, 'w', encoding='utf-8') as handle:
                json.dump(payload, handle, indent=2)
        except Exception as e:
            print(f"⚠️  Could not save analysis cache: {e}")

    def make_json_safe(self, obj):
        """Recursively convert non-JSON-serializable values (e.g., sets) to safe types."""
        if isinstance(obj, set):
            return sorted(obj)
        if isinstance(obj, dict):
            return {key: self.make_json_safe(value) for key, value in obj.items()}
        if isinstance(obj, (list, tuple)):
            return [self.make_json_safe(value) for value in obj]
        return obj

    def compute_file_hash(self, file_path):
        """Hash file contents so unchanged files can reuse cached analysis"""
        digest = hashlib.sha256()
        with open(file_path, 'rb') as handle:
            for chunk in iter(lambda: handle.read(65536), b''):
                digest.update(chunk)
        return digest.hexdigest()

    def normalize_dependency_name(self, name):
        """Normalize dependency names across ecosystems for matching"""
        return str(name).strip().lower().replace('_', '-')

    def parse_version_tuple(self, version):
        """Extract a comparable numeric tuple from a version string"""
        parts = []
        for token in re.findall(r'\d+', str(version)):
            parts.append(int(token))
        return tuple(parts[:4]) if parts else ()

    def version_lt(self, version, threshold):
        """Conservative less-than comparison for common semver-style versions"""
        current = self.parse_version_tuple(version)
        limit = self.parse_version_tuple(threshold)
        if not current or not limit:
            return False
        size = max(len(current), len(limit))
        current += (0,) * (size - len(current))
        limit += (0,) * (size - len(limit))
        return current < limit
    
    def rate_limit_wait(self):
        """Implement rate limiting between API calls"""
        current_time = time.time()
        time_since_last = current_time - self.last_request_time
        
        if time_since_last < self.config['api_delay_seconds']:
            wait_time = self.config['api_delay_seconds'] - time_since_last
            time.sleep(wait_time)
        
        self.last_request_time = time.time()
        self.request_count += 1
    
    def clone_repository(self, repo_url, target_dir='temp_repo'):
        """Clone a git repository"""
        print(f"📥 Cloning repository: {repo_url}")
        
        if os.path.exists(target_dir):
            import shutil
            import stat
            
            def remove_readonly(func, path, excinfo):
                os.chmod(path, stat.S_IWRITE)
                func(path)
            
            try:
                shutil.rmtree(target_dir, onerror=remove_readonly)
            except:
                pass
        
        os.system(f'git clone {repo_url} {target_dir}')
        
        if not os.path.exists(target_dir):
            raise Exception("Failed to clone repository")
        
        print(f"✅ Repository cloned to {target_dir}")
        return target_dir
    
    def should_skip_file(self, file_path):
        """Check if file should be skipped based on patterns"""
        from fnmatch import fnmatch
        
        file_name = os.path.basename(file_path)
        
        for pattern in self.config['skip_patterns']:
            if fnmatch(file_name, pattern):
                return True
        
        return False

    def is_supported_file(self, file_path):
        """Decide whether a file should be scanned"""
        path = Path(file_path)
        normalized = str(path).replace('\\', '/').lower()
        file_name = path.name
        suffix = path.suffix.lower()

        if file_name in self.config.get('special_filenames', []):
            return True

        if '/.github/workflows/' in normalized or '/.azure-pipelines/' in normalized:
            return True

        return suffix in self.config['supported_extensions']

    def classify_file(self, file_path):
        """Classify a repository file by role for downstream analysis and reporting"""
        path = Path(file_path)
        normalized = str(path).replace('\\', '/').lower()
        name = path.name.lower()
        suffix = path.suffix.lower()

        if '/.github/workflows/' in normalized or name in {'jenkinsfile', '.gitlab-ci.yml'}:
            return 'cicd'
        if name in {'dockerfile', 'docker-compose.yml', 'docker-compose.yaml'} or suffix in {'.tf', '.tfvars', '.hcl'}:
            return 'infrastructure'
        if name in {'package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
                    'requirements.txt', 'poetry.lock', 'pipfile', 'pipfile.lock',
                    'go.mod', 'go.sum', 'pom.xml', 'build.gradle', 'build.gradle.kts'}:
            return 'dependency_manifest'
        if name.startswith('.env') or suffix in {'.ini', '.cfg', '.conf', '.properties', '.toml'}:
            return 'configuration'
        if suffix in FRONTEND_EXTENSIONS:
            return 'frontend'
        return 'source_code'

    def calculate_priority(self, file_path, file_type):
        """Prioritize security-relevant and runtime-relevant files early in the scan"""
        path = str(file_path).replace('\\', '/').lower()
        if file_type in {'cicd', 'infrastructure', 'dependency_manifest'}:
            return 0
        if file_type == 'configuration' and '.env' in path:
            return 0
        if file_type == 'frontend':
            return 1
        if Path(file_path).suffix.lower() in self.config['priority_extensions']:
            return 1
        return 2

    def module_name_from_path(self, relative_path):
        """Infer a Python-like module name from a repository-relative path"""
        path = Path(relative_path)
        without_suffix = path.with_suffix('')
        parts = list(without_suffix.parts)
        if parts and parts[-1] == '__init__':
            parts = parts[:-1]
        return '.'.join(parts)

    def resolve_python_import_to_path(self, module_name, known_modules):
        """Resolve an imported module name to a repository-relative file when possible"""
        if not module_name:
            return None
        normalized = module_name.strip('.')
        if normalized in known_modules:
            return known_modules[normalized]
        parts = normalized.split('.')
        while parts:
            candidate = '.'.join(parts)
            if candidate in known_modules:
                return known_modules[candidate]
            parts.pop()
        return None

    def extract_repo_graph(self, repo_path, code_files):
        """Build a lightweight cross-file dependency graph for prioritization"""
        graph = {
            'imports': {},
            'incoming': {},
            'hotspots': {},
            'module_index': {}
        }

        module_index = {}
        for file_info in code_files:
            if Path(file_info['path']).suffix.lower() == '.py':
                module_index[self.module_name_from_path(file_info['path'])] = file_info['path']
        graph['module_index'] = module_index

        for file_info in code_files:
            file_path = file_info['path']
            imports = set()
            incoming = set()
            graph['imports'][file_path] = imports
            graph['incoming'][file_path] = incoming

        for file_info in code_files:
            file_path = file_info['path']
            suffix = Path(file_path).suffix.lower()
            try:
                content = self.read_file_content(file_info['full_path']) or ''
            except Exception:
                content = ''

            if suffix == '.py':
                try:
                    tree = ast.parse(content)
                except SyntaxError:
                    tree = None
                if tree:
                    current_dir = Path(file_path).parent
                    current_module_parts = self.module_name_from_path(file_path).split('.') if self.module_name_from_path(file_path) else []
                    for node in ast.walk(tree):
                        target_path = None
                        if isinstance(node, ast.Import):
                            for alias in node.names:
                                target_path = self.resolve_python_import_to_path(alias.name, module_index)
                                if target_path and target_path != file_path:
                                    graph['imports'][file_path].add(target_path)
                                    graph['incoming'][target_path].add(file_path)
                        elif isinstance(node, ast.ImportFrom):
                            base_module = node.module or ''
                            if node.level:
                                prefix_parts = current_module_parts[:-node.level] if len(current_module_parts) >= node.level else []
                                full_base = '.'.join(prefix_parts + ([base_module] if base_module else []))
                            else:
                                full_base = base_module
                            target_path = self.resolve_python_import_to_path(full_base, module_index)
                            if not target_path:
                                for alias in node.names:
                                    alias_module = '.'.join(part for part in [full_base, alias.name] if part)
                                    target_path = self.resolve_python_import_to_path(alias_module, module_index)
                                    if target_path:
                                        break
                            if target_path and target_path != file_path:
                                graph['imports'][file_path].add(target_path)
                                graph['incoming'][target_path].add(file_path)

            elif suffix in {'.js', '.jsx', '.ts', '.tsx'}:
                for match in re.finditer(r'(?:import\s+.*?from\s+[\'"]([^\'"]+)[\'"]|require\(\s*[\'"]([^\'"]+)[\'"]\s*\))', content):
                    import_target = match.group(1) or match.group(2)
                    if not import_target or not import_target.startswith('.'):
                        continue
                    resolved = self.resolve_relative_import(file_path, import_target, code_files)
                    if resolved and resolved != file_path:
                        graph['imports'][file_path].add(resolved)
                        graph['incoming'][resolved].add(file_path)

        for file_path in graph['imports']:
            imports_out = len(graph['imports'][file_path])
            imports_in = len(graph['incoming'][file_path])
            hotspot_score = imports_in * 2 + imports_out
            graph['hotspots'][file_path] = {
                'imports_out': imports_out,
                'imports_in': imports_in,
                'hotspot_score': hotspot_score
            }

        return graph

    def resolve_relative_import(self, source_file, import_target, code_files):
        """Resolve JS/TS relative imports to repository-relative files"""
        source_path = Path(source_file)
        base = (source_path.parent / import_target).resolve().as_posix()
        known_paths = {Path(item['path']).as_posix(): item['path'] for item in code_files}
        candidates = []
        for extension in ['', '.js', '.jsx', '.ts', '.tsx', '.vue']:
            candidates.append(Path(f"{base}{extension}").as_posix())
        for extension in ['index.js', 'index.jsx', 'index.ts', 'index.tsx', 'index.vue']:
            candidates.append(Path(base, extension).as_posix())

        for candidate in candidates:
            for known_path, original in known_paths.items():
                if known_path.endswith(candidate.split('/')[-1]) and known_path.endswith(candidate.replace('\\', '/').split(':')[-1]):
                    return original

        normalized_source_parent = source_path.parent.as_posix()
        for item in code_files:
            item_path = Path(item['path']).as_posix()
            if item_path.startswith(normalized_source_parent):
                expected_base = Path(normalized_source_parent, import_target).as_posix().replace('/./', '/')
                if item_path.startswith(expected_base):
                    return item['path']
        return None
    
    def get_code_files(self, directory):
        """Recursively get all repository files that should participate in analysis"""
        code_files = []
        
        print(f"🔍 Scanning repository files...")
        
        for root, dirs, files in os.walk(directory):
            # Skip configured directories
            dirs[:] = [d for d in dirs if d not in self.config['skip_directories']]
            
            for file in files:
                file_path = Path(root) / file
                
                if self.should_skip_file(str(file_path)):
                    continue
                
                if self.is_supported_file(file_path):
                    file_size = file_path.stat().st_size
                    max_size = self.config['max_file_size_mb'] * 1024 * 1024
                    
                    if file_size <= max_size:
                        relative_path = file_path.relative_to(directory)
                        file_type = self.classify_file(relative_path)
                        priority = self.calculate_priority(relative_path, file_type)
                        
                        code_files.append({
                            'path': str(relative_path),
                            'full_path': str(file_path),
                            'extension': file_path.suffix or file_path.name,
                            'size': file_size,
                            'priority': priority,
                            'type': file_type
                        })
                    else:
                        print(f"⚠️  Skipping {file_path.name} (too large: {file_size / 1024 / 1024:.2f}MB)")
        
        # Sort by priority (priority files first)
        code_files.sort(key=lambda x: (x['priority'], x['path']))
        
        print(f"✅ Found {len(code_files)} analyzable files")
        return code_files
    
    def read_file_content(self, file_path):
        """Read file content with encoding handling"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except UnicodeDecodeError:
            try:
                with open(file_path, 'r', encoding='latin-1') as f:
                    return f.read()
            except Exception as e:
                print(f"⚠️  Could not read {file_path}: {e}")
                return None
    
    def chunk_large_file(self, content, file_path):
        """Split large files into analyzable chunks"""
        lines = content.split('\n')
        total_lines = len(lines)
        max_lines = self.config['max_lines_per_chunk']
        overlap = self.config['chunk_overlap_lines']
        
        if total_lines <= max_lines:
            return [{'content': content, 'start_line': 1, 'end_line': total_lines, 'chunk_num': 1, 'total_chunks': 1}]
        
        chunks = []
        chunk_num = 1
        start = 0
        
        while start < total_lines:
            end = min(start + max_lines, total_lines)
            chunk_lines = lines[start:end]
            chunk_content = '\n'.join(chunk_lines)
            
            chunks.append({
                'content': chunk_content,
                'start_line': start + 1,
                'end_line': end,
                'chunk_num': chunk_num,
                'total_chunks': 0  # Will update after
            })
            
            chunk_num += 1
            start = end - overlap if end < total_lines else end
        
        # Update total chunks
        for chunk in chunks:
            chunk['total_chunks'] = len(chunks)
        
        return chunks

    def make_finding(self, category, subcategory, severity, title, file_path, location, evidence, impact, fix, confidence='Medium'):
        """Build a normalized finding record for JSON and PDF rendering"""
        return {
            'category': category,
            'subcategory': subcategory,
            'severity': severity,
            'title': title,
            'file': file_path,
            'location': location,
            'evidence': evidence,
            'impact': impact,
            'fix': fix,
            'confidence': confidence
        }

    def get_node_text(self, content, node):
        """Extract source text for an AST node when available"""
        try:
            segment = ast.get_source_segment(content, node)
            if segment:
                return segment.strip().replace('\n', ' ')[:180]
        except Exception:
            pass
        return getattr(node, 'id', getattr(node, 'attr', node.__class__.__name__))

    def analyze_python_ast_risks(self, file_path, content):
        """Run deeper Python-only checks using AST instead of raw regex matching"""
        findings = []
        try:
            tree = ast.parse(content)
        except SyntaxError:
            return findings

        tainted_names = set()
        request_like_names = {'request', 'req', 'params', 'query', 'body', 'form', 'args', 'data', 'json', 'values', 'headers'}
        dangerous_calls = {'os.system', 'os.popen', 'subprocess.run', 'subprocess.Popen', 'subprocess.call',
                           'subprocess.check_output', 'eval', 'exec'}
        db_calls = {'execute', 'executemany', 'raw', 'query'}

        class RiskVisitor(ast.NodeVisitor):
            def visit_Assign(self, node):
                if self._expr_is_tainted(node.value):
                    for target in node.targets:
                        if isinstance(target, ast.Name):
                            tainted_names.add(target.id)
                self.generic_visit(node)

            def visit_AnnAssign(self, node):
                if node.value and isinstance(node.target, ast.Name) and self._expr_is_tainted(node.value):
                    tainted_names.add(node.target.id)
                self.generic_visit(node)

            def visit_For(self, node):
                if isinstance(node.target, ast.Name) and self._expr_is_tainted(node.iter):
                    tainted_names.add(node.target.id)
                self.generic_visit(node)

            def visit_Call(self, node):
                call_name = self._call_name(node.func)
                call_text = self._expr_text(node)
                has_tainted_input = any(self._expr_is_tainted(arg) for arg in node.args) or any(
                    self._expr_is_tainted(keyword.value) for keyword in node.keywords
                )

                if call_name in dangerous_calls:
                    severity = 'High'
                    if has_tainted_input or 'shell=True' in call_text or call_name in {'eval', 'exec', 'os.system'}:
                        severity = 'Critical' if 'shell=True' in call_text or call_name in {'eval', 'exec'} else 'High'
                    findings.append(
                        self._finding(
                            'input_attacks',
                            'tainted_command_injection' if has_tainted_input else 'command_injection',
                            severity,
                            'Python execution sink detected through AST analysis',
                            node,
                            call_text,
                            'Shell or dynamic code execution with untrusted input can lead to remote code execution.',
                            'Remove dynamic execution paths or isolate them behind validated allowlists and explicit argument arrays.',
                            'High' if has_tainted_input else 'Medium'
                        )
                    )

                if call_name.split('.')[-1] in db_calls:
                    first_arg = node.args[0] if node.args else None
                    if first_arg and (self._expr_is_tainted(first_arg) or isinstance(first_arg, (ast.BinOp, ast.JoinedStr, ast.Call))):
                        findings.append(
                            self._finding(
                                'input_attacks',
                                'tainted_sql_injection' if self._expr_is_tainted(first_arg) else 'sql_injection',
                                'Critical' if self._expr_is_tainted(first_arg) else 'High',
                                'Dynamic SQL construction detected through AST analysis',
                                node,
                                self._expr_text(first_arg),
                                'SQL assembled with string operations is vulnerable to injection if any part comes from user input.',
                                'Use bound parameters or ORM query builders instead of composing SQL strings manually.',
                                'High'
                            )
                        )

                self.generic_visit(node)

            def _call_name(self, func):
                if isinstance(func, ast.Name):
                    return func.id
                if isinstance(func, ast.Attribute):
                    root = self._call_name(func.value)
                    return f"{root}.{func.attr}" if root else func.attr
                return ''

            def _expr_text(self, node):
                return self_outer.get_node_text(content, node)

            def _expr_is_tainted(self, node):
                if isinstance(node, ast.Name):
                    return node.id in tainted_names or node.id.lower() in request_like_names
                if isinstance(node, ast.Attribute):
                    base_text = self._expr_text(node).lower()
                    return any(token in base_text for token in request_like_names) or self._expr_is_tainted(node.value)
                if isinstance(node, ast.Subscript):
                    return self._expr_is_tainted(node.value) or self._expr_is_tainted(node.slice)
                if isinstance(node, ast.BinOp):
                    return self._expr_is_tainted(node.left) or self._expr_is_tainted(node.right)
                if isinstance(node, ast.JoinedStr):
                    return any(self._expr_is_tainted(value) for value in node.values)
                if isinstance(node, ast.FormattedValue):
                    return self._expr_is_tainted(node.value)
                if isinstance(node, ast.Call):
                    name = self._call_name(node.func)
                    if name in {'input', 'request.args.get', 'request.form.get', 'request.json.get', 'request.values.get'}:
                        return True
                    return any(self._expr_is_tainted(arg) for arg in node.args)
                if isinstance(node, ast.Tuple):
                    return any(self._expr_is_tainted(element) for element in node.elts)
                return False

            def _finding(self, category, subcategory, severity, title, node, evidence, impact, fix, confidence):
                return self_outer.make_finding(
                    category,
                    subcategory,
                    severity,
                    title,
                    file_path,
                    f"Line {getattr(node, 'lineno', '?')}",
                    evidence,
                    impact,
                    fix,
                    confidence
                )

        self_outer = self
        RiskVisitor().visit(tree)
        return findings

    def build_dependency_vulnerability_finding(self, ecosystem, package_name, version, file_path, location):
        """Return a finding when a dependency version matches a built-in vulnerable threshold"""
        normalized_name = self.normalize_dependency_name(package_name)
        advisory = KNOWN_VULNERABLE_DEPENDENCIES.get(ecosystem, {}).get(normalized_name)
        if not advisory or not version or not self.version_lt(version, advisory['lt']):
            return None
        return self.make_finding(
            'dependency_supply_chain',
            'known_vulnerable_version',
            advisory['severity'],
            'Dependency version matches a built-in vulnerable threshold',
            file_path,
            location,
            f'{package_name} {version} (< {advisory["lt"]})',
            advisory['reason'],
            'Upgrade to a reviewed secure version and refresh the lockfile or deployment image accordingly.',
            'Medium'
        )

    def analyze_dependency_manifest(self, file_path, content):
        """Parse dependency manifests for looser versioning and risky sources"""
        findings = []
        path = file_path.replace('\\', '/').lower()
        lines = content.splitlines()

        if path.endswith('requirements.txt'):
            for line_number, raw_line in enumerate(lines, 1):
                line = raw_line.strip()
                if not line or line.startswith('#'):
                    continue
                package_part = re.split(r'[<>=!~ ]+', line, maxsplit=1)[0]
                pinned_version = None
                if '==' in line:
                    pinned_version = line.split('==', 1)[1].strip()
                if 'git+' in line or 'http://' in line or 'https://' in line:
                    findings.append(self.make_finding(
                        'dependency_supply_chain', 'direct_vcs_dependency', 'High',
                        'Dependency is pulled directly from a VCS or URL',
                        file_path, f'Line {line_number}', line[:160],
                        'Direct URL or VCS dependencies bypass the normal package trust and review path.',
                        'Prefer registry-published, pinned packages and lock them through a reviewed dependency process.',
                        'High'
                    ))
                elif '==' not in line and not any(token in line for token in ['>=', '<=', '~=', '===']):
                    findings.append(self.make_finding(
                        'dependency_supply_chain', 'unpinned_dependency', 'Medium',
                        'Python dependency is not pinned to a reviewed version',
                        file_path, f'Line {line_number}', line[:160],
                        'Unpinned dependencies reduce reproducibility and make vulnerable upgrades harder to control.',
                        'Pin dependency versions and update them through a scheduled review process.',
                        'High'
                    ))
                vuln = self.build_dependency_vulnerability_finding('python', package_part, pinned_version, file_path, f'Line {line_number}')
                if vuln:
                    findings.append(vuln)

        if path.endswith('package.json'):
            try:
                package_data = json.loads(content)
            except json.JSONDecodeError:
                return findings

            for section in ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']:
                deps = package_data.get(section, {})
                for package_name, version in deps.items():
                    if isinstance(version, str) and (version.startswith(('^', '~')) or version in {'*', 'latest'}):
                        findings.append(self.make_finding(
                            'dependency_supply_chain', 'unpinned_dependency', 'Medium',
                            'Node dependency is not pinned tightly',
                            file_path, section, f'{package_name}: {version}',
                            'Loose semver ranges can silently pull risky or breaking releases.',
                            'Pin the dependency to a reviewed version and update it through lockfile refreshes.',
                            'High'
                        ))
                    if isinstance(version, str) and ('github.com' in version or version.startswith(('git+', 'http://', 'https://'))):
                        findings.append(self.make_finding(
                            'dependency_supply_chain', 'direct_vcs_dependency', 'High',
                            'Node dependency is sourced directly from a URL or Git',
                            file_path, section, f'{package_name}: {version}',
                            'Direct Git or URL dependencies increase supply-chain risk and reduce reproducibility.',
                            'Prefer registry releases with lockfile protection and explicit review.',
                            'High'
                        ))
                    clean_version = re.sub(r'^[\^~<>= ]+', '', version) if isinstance(version, str) else ''
                    vuln = self.build_dependency_vulnerability_finding('node', package_name, clean_version, file_path, section)
                    if vuln:
                        findings.append(vuln)

            scripts = package_data.get('scripts', {})
            for script_name, command in scripts.items():
                if isinstance(command, str) and re.search(r'\b(curl|wget)\b.*\|', command):
                    findings.append(self.make_finding(
                        'dependency_supply_chain', 'unsafe_install_script', 'High',
                        'Package script pipes remote content directly into a shell',
                        file_path, f'scripts.{script_name}', command[:160],
                        'Remote script piping is a common supply-chain compromise vector.',
                        'Download artifacts explicitly, verify integrity, and avoid piping network content into a shell.',
                        'High'
                    ))

        if path.endswith('package-lock.json'):
            try:
                lock_data = json.loads(content)
            except json.JSONDecodeError:
                return findings
            packages = lock_data.get('packages', {})
            for package_path, package_meta in packages.items():
                if not isinstance(package_meta, dict):
                    continue
                package_name = package_meta.get('name') or package_path.split('node_modules/')[-1]
                version = package_meta.get('version')
                vuln = self.build_dependency_vulnerability_finding('node', package_name, version, file_path, package_path or 'packages')
                if vuln:
                    findings.append(vuln)

        if path.endswith('yarn.lock'):
            current_name = None
            for line_number, raw_line in enumerate(lines, 1):
                if raw_line and not raw_line.startswith(' ') and '@' in raw_line:
                    current_name = raw_line.split('@', 1)[0].strip('"')
                if raw_line.strip().startswith('version "') and current_name:
                    version = raw_line.split('"')[1]
                    vuln = self.build_dependency_vulnerability_finding('node', current_name, version, file_path, f'Line {line_number}')
                    if vuln:
                        findings.append(vuln)

        if path.endswith('pom.xml'):
            for artifact_id, version in re.findall(r'<artifactId>([^<]+)</artifactId>\s*<version>([^<]+)</version>', content, re.IGNORECASE):
                vuln = self.build_dependency_vulnerability_finding('java', artifact_id, version, file_path, 'pom.xml')
                if vuln:
                    findings.append(vuln)

        return findings

    def analyze_frontend_quality(self, file_path, content):
        """Collect frontend-focused maintainability, accessibility, and UX findings"""
        findings = []
        lines = content.splitlines()
        lowered = content.lower()

        if '<img' in lowered and 'alt=' not in lowered:
            findings.append(self.make_finding(
                'frontend_quality', 'accessibility', 'Medium',
                'Image tag appears to be missing alt text',
                file_path, 'File-level', '<img ...>',
                'Missing alt text reduces screen-reader usability and accessibility compliance.',
                'Add meaningful alt text or explicit empty alt text for decorative images.',
                'Medium'
            ))

        if ('onclick=' in lowered or 'onkeypress=' in lowered) and 'button' not in lowered:
            findings.append(self.make_finding(
                'frontend_quality', 'interaction_accessibility', 'Medium',
                'Interactive markup may rely on non-semantic click handlers',
                file_path, 'File-level', 'Inline or non-semantic event handler pattern detected',
                'Non-semantic interactive elements often break keyboard access and focus behavior.',
                'Use semantic interactive elements such as button or link and ensure keyboard support.',
                'Medium'
            ))

        jsx_conditionals = sum(line.count('&&') + line.count('?') for line in lines)
        if jsx_conditionals >= 10:
            findings.append(self.make_finding(
                'frontend_quality', 'ui_complexity', 'Medium',
                'Frontend component has dense conditional rendering',
                file_path, 'File-level', f'Conditional render markers: {jsx_conditionals}',
                'Dense conditional rendering is harder to reason about and usually indicates missing decomposition.',
                'Split the component into smaller presentational or state-specific subcomponents.',
                'Medium'
            ))

        if ('useeffect(' in lowered or 'useeffectevent(' in lowered) and lowered.count('fetch(') + lowered.count('axios.') > 1:
            findings.append(self.make_finding(
                'frontend_quality', 'data_fetching', 'Low',
                'Frontend file performs multiple network fetches',
                file_path, 'File-level', 'Multiple fetch or axios calls detected',
                'Repeated fetching in a single component often creates loading-state drift and unnecessary rerenders.',
                'Consolidate data access into a dedicated hook or loader and cache repeated requests.',
                'Low'
            ))

        return findings

    def analyze_framework_specific_risks(self, file_path, content, file_type):
        """Add framework-aware heuristics on top of generic file scanning"""
        findings = []
        lowered = content.lower()
        suffix = Path(file_path).suffix.lower()

        if suffix == '.py':
            if ('from flask import request' in lowered or 'flask import' in lowered) and ('request.args' in lowered or 'request.form' in lowered):
                if 'csrf' not in lowered and ('@app.route' in lowered or 'blueprint.route' in lowered):
                    findings.append(self.make_finding(
                        'application_security',
                        'flask_request_validation',
                        'Medium',
                        'Flask handler reads request input without obvious CSRF or validation markers',
                        file_path,
                        'File-level',
                        'Flask request access patterns detected',
                        'Request-handling code without visible validation or CSRF controls often leads to weak input and form protection.',
                        'Add explicit input validation, schema checks, and CSRF protection where form state changes occur.',
                        'Low'
                    ))

            if ('fastapi' in lowered or 'from pydantic' in lowered) and '@app.' in lowered and 'response_model' not in lowered:
                findings.append(self.make_finding(
                    'application_security',
                    'fastapi_response_contract',
                    'Low',
                    'FastAPI route does not show an explicit response_model',
                    file_path,
                    'File-level',
                    'FastAPI route decorator detected without response_model marker',
                    'Routes without explicit response contracts are harder to validate and audit for response leakage.',
                    'Declare response models for public routes where practical.',
                    'Low'
                ))

            if 'django' in lowered and ('csrf_exempt' in lowered or '@csrf_exempt' in lowered):
                findings.append(self.make_finding(
                    'application_security',
                    'django_csrf_exempt',
                    'High',
                    'Django view disables CSRF protection',
                    file_path,
                    'File-level',
                    'csrf_exempt detected',
                    'Disabling CSRF protection on state-changing endpoints increases the risk of cross-site request forgery.',
                    'Limit exemptions to narrowly justified endpoints and compensate with stronger request authentication.',
                    'High'
                ))

        if file_type == 'frontend':
            if 'dangerouslysetinnerhtml' in lowered or 'v-html' in lowered:
                findings.append(self.make_finding(
                    'frontend_quality',
                    'unsafe_html_rendering',
                    'High',
                    'Frontend code renders raw HTML',
                    file_path,
                    'File-level',
                    'dangerouslySetInnerHTML or v-html detected',
                    'Rendering raw HTML increases XSS risk unless the content is strictly sanitized.',
                    'Sanitize HTML at the trust boundary or avoid raw HTML injection entirely.',
                    'High'
                ))

            if ('next/router' in lowered or 'next/navigation' in lowered) and 'router.push(' in lowered and 'encodeuricomponent' not in lowered:
                findings.append(self.make_finding(
                    'frontend_quality',
                    'unsafe_navigation_params',
                    'Low',
                    'Client navigation appears to interpolate route parameters directly',
                    file_path,
                    'File-level',
                    'router.push detected without visible encoding markers',
                    'Interpolated route parameters can create broken navigation or accidental injection into query strings.',
                    'Encode dynamic parameters and centralize route construction helpers.',
                    'Low'
                ))

            if ('useeffect(' in lowered or 'useeffectevent(' in lowered) and '[]' not in lowered and lowered.count('useeffect(') >= 1:
                findings.append(self.make_finding(
                    'frontend_quality',
                    'effect_dependency_review',
                    'Low',
                    'Frontend effect usage may need dependency review',
                    file_path,
                    'File-level',
                    'useEffect detected',
                    'Effects with implicit or complex dependencies are a common source of rerender bugs and stale state.',
                    'Review effect dependencies and consider moving async behavior into dedicated hooks or loaders.',
                    'Low'
                ))

        return findings

    def build_local_findings(self, file_path, content, file_type):
        """Run lightweight repository-wide security and risk checks"""
        findings = []
        lines = content.splitlines()

        secret_patterns = [
            (re.compile(r'(?i)(api[_-]?key|secret|token|password)\s*[:=]\s*[\'"][^\'"]{8,}[\'"]'), 'High', 'Potential hardcoded credential', 'Move the secret to a secure secret manager or environment store and remove it from the repository'),
            (re.compile(r'AKIA[0-9A-Z]{16}'), 'Critical', 'AWS access key detected', 'Rotate the key immediately and remove it from the repository history'),
            (re.compile(r'-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----'), 'Critical', 'Private key material detected', 'Revoke the key, rotate it, and store private key material outside the repository'),
        ]

        for line_number, line in enumerate(lines, 1):
            for pattern, severity, title, fix in secret_patterns:
                match = pattern.search(line)
                if match:
                    findings.append(
                        self.make_finding(
                            'secret_exposure',
                            'hardcoded_secret',
                            severity,
                            title,
                            file_path,
                            f'Line {line_number}',
                            match.group(0)[:140],
                            'Secrets committed to source or config can lead to immediate credential compromise.',
                            fix,
                            'High'
                        )
                    )

        sql_patterns = [
            re.compile(r'(?i)(execute|executemany|raw|query)\s*\(\s*f["\']'),
            re.compile(r'(?i)(execute|executemany|raw|query)\s*\(.*(\+|\%|\.format\()'),
        ]
        for line_number, line in enumerate(lines, 1):
            if any(pattern.search(line) for pattern in sql_patterns):
                findings.append(
                    self.make_finding(
                        'input_attacks',
                        'sql_injection',
                        'High',
                        'SQL query appears to be built from dynamic input',
                        file_path,
                        f'Line {line_number}',
                        line.strip()[:160],
                        'Dynamic SQL construction can allow attackers to alter the query and access or modify data.',
                        'Use parameterized queries or ORM binding instead of string interpolation or concatenation.',
                        'Medium'
                    )
                )

        command_patterns = [
            re.compile(r'os\.system\s*\('),
            re.compile(r'subprocess\.(run|Popen|call|check_output)\s*\('),
            re.compile(r'(?<!\w)(eval|exec)\s*\('),
        ]
        for line_number, line in enumerate(lines, 1):
            if any(pattern.search(line) for pattern in command_patterns):
                severity = 'High' if 'shell=True' in line or 'os.system' in line or 'eval(' in line else 'Medium'
                findings.append(
                    self.make_finding(
                        'input_attacks',
                        'command_injection',
                        severity,
                        'Command or script execution primitive detected',
                        file_path,
                        f'Line {line_number}',
                        line.strip()[:160],
                        'Unsanitized user input reaching shell execution can lead to remote command execution.',
                        'Avoid shell execution for user-controlled input; prefer safe APIs and explicit argument lists.',
                        'Medium'
                    )
                )

        if file_type == 'cicd':
            for line_number, line in enumerate(lines, 1):
                stripped = line.strip()
                if stripped.startswith('uses:') and '@' in stripped and not re.search(r'@[0-9a-f]{40}$', stripped, re.IGNORECASE):
                    findings.append(
                        self.make_finding(
                            'cicd_misconfiguration',
                            'unpinned_action',
                            'High',
                            'Third-party CI/CD action is not pinned to a commit SHA',
                            file_path,
                            f'Line {line_number}',
                            stripped,
                            'Mutable action tags increase supply-chain risk if the upstream tag changes unexpectedly.',
                            'Pin third-party actions to a full commit SHA and review updates explicitly.',
                            'High'
                        )
                    )
                if 'pull_request_target' in stripped:
                    findings.append(
                        self.make_finding(
                            'cicd_misconfiguration',
                            'unsafe_trigger',
                            'High',
                            'CI/CD workflow uses pull_request_target',
                            file_path,
                            f'Line {line_number}',
                            stripped,
                            'This trigger can expose privileged tokens and secrets to untrusted pull request code when combined with unsafe checkout or script execution.',
                            'Review the workflow for secret access and untrusted code execution paths; prefer safer triggers where possible.',
                            'Medium'
                        )
                    )
                if 'write-all' in stripped:
                    findings.append(
                        self.make_finding(
                            'cicd_misconfiguration',
                            'broad_permissions',
                            'Medium',
                            'Workflow grants broad token permissions',
                            file_path,
                            f'Line {line_number}',
                            stripped,
                            'Overly broad CI/CD permissions increase blast radius if the workflow or runner is compromised.',
                            'Restrict workflow permissions to the minimum scopes required by each job.',
                            'High'
                        )
                    )

        if file_type == 'infrastructure':
            for line_number, line in enumerate(lines, 1):
                stripped = line.strip()
                if stripped.startswith('FROM ') and ':latest' in stripped:
                    findings.append(
                        self.make_finding(
                            'infra_risk',
                            'floating_image_tag',
                            'Medium',
                            'Container image uses a floating latest tag',
                            file_path,
                            f'Line {line_number}',
                            stripped,
                            'Floating image tags reduce build reproducibility and can pull unexpected vulnerable images.',
                            'Pin the base image to a specific immutable version or digest.',
                            'High'
                        )
                    )
                if stripped.upper().startswith('USER ROOT'):
                    findings.append(
                        self.make_finding(
                            'infra_risk',
                            'root_container',
                            'High',
                            'Container runs as root',
                            file_path,
                            f'Line {line_number}',
                            stripped,
                            'Running workloads as root increases the impact of container escape or application compromise.',
                            'Create a dedicated non-root user and switch to it before runtime.',
                            'High'
                        )
                    )

        if file_type == 'dependency_manifest':
            findings.extend(self.analyze_dependency_manifest(file_path, content))

        if Path(file_path).suffix.lower() == '.py':
            findings.extend(self.analyze_python_ast_risks(file_path, content))

        if file_type == 'frontend':
            findings.extend(self.analyze_frontend_quality(file_path, content))

        findings.extend(self.analyze_framework_specific_risks(file_path, content, file_type))

        deduped = []
        seen = set()
        for finding in findings:
            key = (finding['category'], finding['subcategory'], finding['file'], finding['location'], finding['title'])
            if key not in seen:
                seen.add(key)
                deduped.append(finding)

        deduped.sort(key=lambda item: (SEVERITY_ORDER.get(item['severity'], 99), item['location']))
        return deduped

    def build_frontend_signal_summary(self, content):
        """Collect lightweight UI indicators for frontend files"""
        lowered = content.lower()
        return {
            'loading_state': 'loading' in lowered or 'skeleton' in lowered,
            'error_state': 'error' in lowered or 'catch (' in lowered or '.catch(' in lowered,
            'empty_state': 'empty' in lowered or 'no data' in lowered or 'no results' in lowered,
            'accessibility_markers': '<label' in lowered or 'aria-' in lowered or 'role=' in lowered,
            'responsive_markers': '@media' in lowered or 'sm:' in lowered or 'md:' in lowered or 'lg:' in lowered,
            'form_markers': '<form' in lowered or 'useform' in lowered or 'onsubmit' in lowered,
            'test_selectors': 'data-testid' in lowered or 'aria-label' in lowered
        }

    def estimate_local_metrics(self, content, file_type, findings):
        """Generate fallback metrics when LLM analysis is unavailable or incomplete"""
        lines = [line for line in content.splitlines() if line.strip()]
        total_lines = max(len(lines), 1)
        comment_lines = sum(1 for line in lines if line.strip().startswith(('#', '//', '/*', '*', '<!--')))
        complexity_hits = sum(line.count('if ') + line.count('for ') + line.count('while ') + line.count('case ') for line in lines)
        severity_penalty = sum({'Critical': 15, 'High': 10, 'Medium': 6, 'Low': 3}.get(f['severity'], 0) for f in findings)
        complexity_score = max(20, 100 - min(70, complexity_hits * 3 + total_lines // 40))
        documentation_score = min(100, int((comment_lines / total_lines) * 100) + 35)
        maintainability_score = max(20, 95 - min(65, total_lines // 35 + complexity_hits * 2 + len(findings) * 4))
        efficiency_score = max(25, 90 - min(55, complexity_hits * 2 + len(findings) * 3))
        accuracy_score = max(25, 92 - min(60, severity_penalty))
        overall_score = round((accuracy_score + complexity_score + efficiency_score + maintainability_score + documentation_score) / 5)

        metrics = {
            'accuracy': {
                'score': accuracy_score,
                'explanation': 'Local heuristic based on severity of detected findings and obvious risky constructs.',
                'details': [f'{len(findings)} local findings influenced this score.']
            },
            'complexity': {
                'score': complexity_score,
                'explanation': 'Estimated from branching keywords, file size, and density of control-flow constructs.',
                'details': [f'Approximate complexity hits: {complexity_hits}', f'Non-empty lines: {total_lines}']
            },
            'efficiency': {
                'score': efficiency_score,
                'explanation': 'Estimated from control-flow density and issue count rather than runtime profiling.',
                'details': [f'Local finding count: {len(findings)}']
            },
            'maintainability': {
                'score': maintainability_score,
                'explanation': 'Estimated from size, complexity, and concentration of risky patterns.',
                'details': [f'Comment lines: {comment_lines}', f'Non-empty lines: {total_lines}']
            },
            'documentation': {
                'score': documentation_score,
                'explanation': 'Estimated from comment density and self-describing structure only.',
                'details': [f'Comment density: {round((comment_lines / total_lines) * 100, 1)}%']
            },
            'overallScore': overall_score
        }

        if file_type == 'frontend':
            signals = self.build_frontend_signal_summary(content)
            metrics['frontendSignals'] = signals
            frontend_bonus = 0
            if signals['loading_state'] and signals['error_state']:
                frontend_bonus += 3
            if signals['accessibility_markers']:
                frontend_bonus += 2
            metrics['maintainability']['score'] = min(100, metrics['maintainability']['score'] + frontend_bonus)
            metrics['documentation']['details'].append(
                f"Frontend signals: loading={signals['loading_state']}, error={signals['error_state']}, responsive={signals['responsive_markers']}"
            )
            metrics['overallScore'] = round((
                metrics['accuracy']['score'] +
                metrics['complexity']['score'] +
                metrics['efficiency']['score'] +
                metrics['maintainability']['score'] +
                metrics['documentation']['score']
            ) / 5)

        return metrics

    def enrich_analysis(self, base_analysis, file_info, content, local_findings, graph_metadata=None):
        """Attach local scan output and normalized metadata to an analysis result"""
        analysis = dict(base_analysis or {})
        fallback_metrics = self.estimate_local_metrics(content, file_info['type'], local_findings)

        for metric_name in ['accuracy', 'complexity', 'efficiency', 'maintainability', 'documentation']:
            if metric_name not in analysis or not isinstance(analysis.get(metric_name), dict):
                analysis[metric_name] = fallback_metrics[metric_name]

        if 'overallScore' not in analysis:
            analysis['overallScore'] = fallback_metrics['overallScore']

        analysis['file'] = file_info['path']
        analysis['extension'] = file_info['extension']
        analysis['lines_of_code'] = len(content.split('\n'))
        analysis['fileType'] = file_info['type']
        analysis['analysisSources'] = ['local']
        if base_analysis:
            analysis['analysisSources'].insert(0, 'llm')
        if graph_metadata:
            analysis['graph'] = graph_metadata

        severity_counts = {'Critical': 0, 'High': 0, 'Medium': 0, 'Low': 0}
        for finding in local_findings:
            severity_counts[finding['severity']] = severity_counts.get(finding['severity'], 0) + 1

        analysis['findings'] = local_findings
        analysis['riskSummary'] = {
            'total_findings': len(local_findings),
            'severity_counts': severity_counts,
            'top_severity': next((level for level in ['Critical', 'High', 'Medium', 'Low'] if severity_counts[level] > 0), 'Info')
        }

        if file_info['type'] == 'frontend':
            analysis['frontendMetricGuide'] = FRONTEND_METRIC_GUIDE
            analysis['frontendSignals'] = fallback_metrics.get('frontendSignals', {})

        if local_findings:
            analysis.setdefault('codeQualityIssues', [])
            for finding in local_findings[:6]:
                analysis['codeQualityIssues'].append({
                    'type': finding['subcategory'],
                    'location': finding['location'],
                    'description': finding['title'],
                    'priority': finding['severity']
                })
            analysis.setdefault('weaknesses', [])
            for finding in local_findings[:5]:
                analysis['weaknesses'].append({
                    'issue': finding['title'],
                    'location': finding['location'],
                    'code': finding['evidence'],
                    'severity': finding['severity'],
                    'reason': finding['impact']
                })
            analysis.setdefault('suggestions', [])
            for finding in local_findings[:5]:
                analysis['suggestions'].append({
                    'suggestion': finding['fix'],
                    'location': finding['location'],
                    'current': finding['evidence'],
                    'recommended': finding['fix'],
                    'benefit': finding['impact']
                })

        return analysis
    
    def analyze_file_with_claude(self, file_path, file_content, chunk_info=None):
        """Analyze a single file or chunk using Claude API with retry logic"""
        if not self.api_key or not self.client:
            return None
        
        # Prepare content with line numbers
        lines = file_content.split('\n')
        start_line = chunk_info['start_line'] if chunk_info else 1
        numbered_content = '\n'.join([f"{start_line + i:4d} | {line}" for i, line in enumerate(lines[:500])])
        
        chunk_context = ""
        if chunk_info and chunk_info['total_chunks'] > 1:
            chunk_context = f"\nNOTE: This is chunk {chunk_info['chunk_num']}/{chunk_info['total_chunks']} of a large file (lines {chunk_info['start_line']}-{chunk_info['end_line']})."
        
        prompt = f"""Analyze this code file in extreme detail and provide a comprehensive structured evaluation with specific code references.

File: {file_path}{chunk_context}
Code with line numbers:
```
{numbered_content}
```

Provide a DETAILED analysis with SPECIFIC line number references for every point. Respond ONLY with valid JSON (no markdown, no backticks, no preamble).

Return JSON with this EXACT structure:
{{
  "accuracy": {{
    "score": <number 0-100>,
    "explanation": "Detailed explanation",
    "details": ["Point 1 with line references", "Point 2"]
  }},
  "complexity": {{
    "score": <number 0-100>,
    "explanation": "Detailed explanation",
    "details": ["Point 1", "Point 2"]
  }},
  "efficiency": {{
    "score": <number 0-100>,
    "explanation": "Detailed explanation",
    "details": ["Point 1", "Point 2"]
  }},
  "maintainability": {{
    "score": <number 0-100>,
    "explanation": "Detailed explanation",
    "details": ["Point 1", "Point 2"]
  }},
  "documentation": {{
    "score": <number 0-100>,
    "explanation": "Detailed explanation",
    "details": ["Point 1", "Point 2"]
  }},
  "overallScore": <number 0-100>,
  "strengths": [
    {{"point": "Strength", "location": "Lines X-Y", "impact": "Why good"}}
  ],
  "weaknesses": [
    {{"issue": "Problem", "location": "Line X", "code": "Code snippet", "severity": "High/Medium/Low", "reason": "Why problematic"}}
  ],
  "suggestions": [
    {{"suggestion": "What to improve", "location": "Line X", "current": "Current code", "recommended": "Recommended fix", "benefit": "Why this helps"}}
  ],
  "codeQualityIssues": [
    {{"type": "Issue type", "location": "Line X", "description": "Detailed description", "priority": "High/Medium/Low"}}
  ]
}}"""

        # Retry logic
        for attempt in range(self.config['max_retries']):
            try:
                # Rate limiting
                self.rate_limit_wait()
                
                message = self.client.messages.create(
                    model="claude-sonnet-4-20250514",
                    max_tokens=2500,
                    temperature=0,  # Consistent results
                    messages=[{"role": "user", "content": prompt}]
                )
                response_text = message.content[0].text
                
                # Enhanced JSON extraction
                clean_text = response_text.strip()
                clean_text = clean_text.replace('```json', '').replace('```', '').strip()
                
                first_brace = clean_text.find('{')
                last_brace = clean_text.rfind('}')
                
                if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                    clean_text = clean_text[first_brace:last_brace + 1]
                
                # Try multiple parsing methods
                analysis = None
                parse_attempts = [
                    lambda: json.loads(clean_text),
                    lambda: json.loads(clean_text.replace('\n', ' ')),
                    lambda: json.loads(clean_text.replace('\\', '\\\\')),
                ]
                
                for parse_attempt in parse_attempts:
                    try:
                        analysis = parse_attempt()
                        break
                    except json.JSONDecodeError:
                        continue
                
                if analysis is None:
                    raise json.JSONDecodeError("All parsing attempts failed", clean_text, 0)
                
                # Validate required fields
                required_fields = ['accuracy', 'complexity', 'efficiency', 'maintainability', 
                                 'documentation', 'overallScore']
                
                for field in required_fields:
                    if field not in analysis:
                        if field == 'overallScore':
                            analysis[field] = 0
                        else:
                            analysis[field] = {'score': 0, 'explanation': 'Not analyzed', 'details': []}
                
                # Add chunk info if applicable
                if chunk_info:
                    analysis['chunk_info'] = chunk_info
                
                return analysis
                
            except json.JSONDecodeError as e:
                if attempt < self.config['max_retries'] - 1:
                    wait_time = self.config['retry_delay_seconds'] * (attempt + 1)
                    print(f"   ⚠️  JSON parse error (attempt {attempt + 1}/{self.config['max_retries']}), retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    print(f"⚠️  JSON parsing failed after {self.config['max_retries']} attempts")
                    print(f"   Response preview: {response_text[:200] if 'response_text' in locals() else 'N/A'}...")
                    return None
                    
            except Exception as e:
                if attempt < self.config['max_retries'] - 1:
                    wait_time = self.config['retry_delay_seconds'] * (attempt + 1)
                    print(f"   ⚠️  Error (attempt {attempt + 1}/{self.config['max_retries']}): {e}, retrying in {wait_time}s...")
                    time.sleep(wait_time)
                else:
                    print(f"⚠️  Analysis failed after {self.config['max_retries']} attempts: {e}")
                    return None
        
        return None
    
    def merge_chunk_analyses(self, chunk_analyses, file_path):
        """Merge multiple chunk analyses into one file analysis"""
        if not chunk_analyses:
            return None
        
        if len(chunk_analyses) == 1:
            return chunk_analyses[0]
        
        # Average scores across chunks
        merged = {
            'file': file_path,
            'is_chunked': True,
            'total_chunks': len(chunk_analyses)
        }
        
        metrics = ['accuracy', 'complexity', 'efficiency', 'maintainability', 'documentation']
        
        for metric in metrics:
            scores = [c[metric]['score'] for c in chunk_analyses if metric in c and isinstance(c[metric], dict)]
            if scores:
                merged[metric] = {
                    'score': round(sum(scores) / len(scores)),
                    'explanation': f"Average across {len(scores)} chunks",
                    'details': []
                }
        
        # Overall score
        overall_scores = [c.get('overallScore', 0) for c in chunk_analyses]
        merged['overallScore'] = round(sum(overall_scores) / len(overall_scores))
        
        # Combine all strengths, weaknesses, suggestions
        merged['strengths'] = []
        merged['weaknesses'] = []
        merged['suggestions'] = []
        merged['codeQualityIssues'] = []
        
        for chunk in chunk_analyses:
            merged['strengths'].extend(chunk.get('strengths', []))
            merged['weaknesses'].extend(chunk.get('weaknesses', []))
            merged['suggestions'].extend(chunk.get('suggestions', []))
            merged['codeQualityIssues'].extend(chunk.get('codeQualityIssues', []))
        
        return merged
    
    def analyze_repository(self, repo_path, repo_name, resume=False, incremental=False):
        """Analyze all repository files and attach local security findings"""
        print("\n" + "="*60)
        print("🚀 Starting Comprehensive Repository Analysis")
        print("="*60 + "\n")
        
        # Check for previous progress
        analyses = []
        analyzed_files = set()
        
        if resume:
            previous_analyses = self.load_progress(repo_name)
            if previous_analyses:
                analyses = previous_analyses
                analyzed_files = {a['file'] for a in analyses}
                print(f"▶️  Resuming from {len(analyzed_files)} previously analyzed files")

        analysis_cache = self.load_analysis_cache(repo_name) if incremental else {}
        cache_hits = 0
        refreshed_files = 0
        cache_entries = {}

        for analysis in analyses:
            if analysis.get('content_hash'):
                cache_entries[analysis['file']] = {
                    'content_hash': analysis['content_hash'],
                    'analysis': analysis
                }
        
        code_files = self.get_code_files(repo_path)
        repo_graph = self.extract_repo_graph(repo_path, code_files)
        
        if not code_files:
            print("❌ No repository files found to analyze")
            return None
        
        skipped_files = []
        total_files = len(code_files)
        
        for idx, file_info in enumerate(code_files, 1):
            file_path = file_info['path']
            
            # Skip if already analyzed
            if file_path in analyzed_files:
                print(f"\n⏭️  Skipping [{idx}/{total_files}]: {file_path} (already analyzed)")
                continue
            
            print(f"\n📊 Analyzing [{idx}/{total_files}]: {file_path}")
            
            content = self.read_file_content(file_info['full_path'])
            if not content:
                skipped_files.append((file_path, "Could not read file"))
                continue

            content_hash = self.compute_file_hash(file_info['full_path']) if incremental else None
            cached_entry = analysis_cache.get(file_path) if incremental else None
            if incremental and cached_entry and cached_entry.get('content_hash') == content_hash:
                cached_analysis = dict(cached_entry.get('analysis', {}))
                cached_analysis['analysisSources'] = list(dict.fromkeys(cached_analysis.get('analysisSources', []) + ['cache']))
                analyses.append(cached_analysis)
                cache_entries[file_path] = {
                    'content_hash': content_hash,
                    'analysis': cached_analysis
                }
                cache_hits += 1
                print(f"   ♻️  Reused cached analysis")
                continue

            local_findings = self.build_local_findings(file_path, content, file_info['type'])
            graph_metadata = repo_graph.get('hotspots', {}).get(file_path, {'imports_out': 0, 'imports_in': 0, 'hotspot_score': 0})
            
            # Handle large files with chunking
            chunks = self.chunk_large_file(content, file_path)
            
            if len(chunks) > 1:
                print(f"   📄 Large file detected: splitting into {len(chunks)} chunks")
            
            chunk_analyses = []
            failed_chunks = []
            for chunk in chunks:
                chunk_info = {
                    'start_line': chunk['start_line'],
                    'end_line': chunk['end_line'],
                    'chunk_num': chunk['chunk_num'],
                    'total_chunks': chunk['total_chunks']
                }
                
                analysis = self.analyze_file_with_claude(file_path, chunk['content'], chunk_info if len(chunks) > 1 else None)
                
                if analysis:
                    chunk_analyses.append(analysis)
                else:
                    failed_chunks.append(chunk['chunk_num'])
            
            if chunk_analyses:
                # Merge chunks if multiple
                final_analysis = self.merge_chunk_analyses(chunk_analyses, file_path)
                
                if final_analysis:
                    final_analysis = self.enrich_analysis(final_analysis, file_info, content, local_findings, graph_metadata=graph_metadata)
                    if content_hash:
                        final_analysis['content_hash'] = content_hash
                    analyses.append(final_analysis)
                    cache_entries[file_path] = {
                        'content_hash': content_hash,
                        'analysis': final_analysis
                    }
                    refreshed_files += 1
                    
                    overall = final_analysis.get('overallScore', 0)
                    print(f"   ✅ Overall Score: {overall}/100 | Local findings: {len(local_findings)}")
                    if failed_chunks:
                        print(f"   ⚠️  Partial LLM coverage only; failed chunks: {', '.join(str(chunk_num) for chunk_num in failed_chunks)}")
                    
                    # Save progress after each file
                    self.save_progress(analyses, repo_name)
            else:
                final_analysis = self.enrich_analysis(None, file_info, content, local_findings, graph_metadata=graph_metadata)
                if content_hash:
                    final_analysis['content_hash'] = content_hash
                analyses.append(final_analysis)
                cache_entries[file_path] = {
                    'content_hash': content_hash,
                    'analysis': final_analysis
                }
                refreshed_files += 1
                print(f"   ⚠️  LLM analysis unavailable, stored local analysis only")
                self.save_progress(analyses, repo_name)
        
        # Print summary
        if skipped_files:
            print(f"\n⚠️  Skipped {len(skipped_files)} file(s):")
            for file_path, reason in skipped_files:
                print(f"   • {file_path}: {reason}")
        
        if incremental:
            self.save_analysis_cache(repo_name, cache_entries)
            print(f"\n♻️  Cache hits: {cache_hits} | Refreshed files: {refreshed_files}")

        print(f"\n📊 API Requests made: {self.request_count}")
        
        return {
            'analyses': analyses,
            'skipped_files': skipped_files,
            'files_scanned': total_files,
            'cache_hits': cache_hits,
            'refreshed_files': refreshed_files,
            'repo_graph': repo_graph
        }
    
    def calculate_aggregate_metrics(self, analyses):
        """Calculate repository-wide metrics"""
        if not analyses:
            return None
        
        metrics = {
            'accuracy': 0,
            'complexity': 0,
            'efficiency': 0,
            'maintainability': 0,
            'documentation': 0,
            'overallScore': 0
        }
        
        for analysis in analyses:
            for key in metrics.keys():
                if key in analysis:
                    if isinstance(analysis[key], dict):
                        metrics[key] += analysis[key].get('score', 0)
                    else:
                        metrics[key] += analysis[key]
        
        for key in metrics.keys():
            metrics[key] = round(metrics[key] / len(analyses), 1)
        
        return metrics
    
    def build_report_data(self, analyses, repo_name, repo_path, skipped_files=None, cache_hits=0, refreshed_files=0, repo_graph=None):
        """Build the canonical JSON report structure used by all renderers"""
        aggregate = self.calculate_aggregate_metrics(analyses) or {}
        all_findings = []
        category_counts = {}
        severity_counts = {'Critical': 0, 'High': 0, 'Medium': 0, 'Low': 0}
        file_type_counts = {}

        for analysis in analyses:
            file_type = analysis.get('fileType', 'unknown')
            file_type_counts[file_type] = file_type_counts.get(file_type, 0) + 1

            for finding in analysis.get('findings', []):
                all_findings.append(finding)
                severity_counts[finding['severity']] = severity_counts.get(finding['severity'], 0) + 1
                category_counts[finding['category']] = category_counts.get(finding['category'], 0) + 1

        all_findings.sort(key=lambda item: (SEVERITY_ORDER.get(item['severity'], 99), item['file'], item['location']))

        summary = {
            'files_scanned': len(analyses),
            'total_lines_of_code': sum(a.get('lines_of_code', 0) for a in analyses),
            'critical_findings': severity_counts['Critical'],
            'high_findings': severity_counts['High'],
            'medium_findings': severity_counts['Medium'],
            'low_findings': severity_counts['Low'],
            'chunked_files': sum(1 for a in analyses if a.get('is_chunked')),
            'frontend_files': file_type_counts.get('frontend', 0),
            'cicd_files': file_type_counts.get('cicd', 0),
            'infra_files': file_type_counts.get('infrastructure', 0),
            'dependency_manifests': file_type_counts.get('dependency_manifest', 0)
        }
        summary['cache_hits'] = cache_hits
        summary['refreshed_files'] = refreshed_files

        top_findings = all_findings[:10]
        top_files = sorted(
            analyses,
            key=lambda item: (
                SEVERITY_ORDER.get(item.get('riskSummary', {}).get('top_severity', 'Info'), 99),
                -item.get('graph', {}).get('hotspot_score', 0),
                -item.get('riskSummary', {}).get('total_findings', 0),
                item.get('overallScore', 0)
            )
        )[:12]
        analysis_source_counts = {}
        for analysis in analyses:
            for source in analysis.get('analysisSources', []):
                analysis_source_counts[source] = analysis_source_counts.get(source, 0) + 1

        skills_gap_analysis = {
            'overall_proficiency': round(float(aggregate.get('overallScore', 0) or 0), 1),
            'skill_levels': {
                'Accuracy': round(float(aggregate.get('accuracy', 0) or 0), 1),
                'Complexity': round(float(aggregate.get('complexity', 0) or 0), 1),
                'Efficiency': round(float(aggregate.get('efficiency', 0) or 0), 1),
                'Maintainability': round(float(aggregate.get('maintainability', 0) or 0), 1),
                'Documentation': round(float(aggregate.get('documentation', 0) or 0), 1)
            },
            'identified_gaps': []
        }
        for skill_name, score in skills_gap_analysis['skill_levels'].items():
            if score < 60:
                severity = 'High' if score < 40 else 'Medium'
                skills_gap_analysis['identified_gaps'].append({
                    'skill': skill_name,
                    'score': score,
                    'severity': severity
                })

        return {
            'repo': {
                'name': repo_name,
                'path': repo_path,
                'generated_at': datetime.now().isoformat(),
                'api_requests': self.request_count
            },
            'summary': summary,
            'aggregate_metrics': aggregate,
            'total_files_analyzed': len(analyses),
            'critical_issues': all_findings[:25],
            'severity_counts': severity_counts,
            'category_counts': category_counts,
            'file_type_counts': file_type_counts,
            'analysis_source_counts': analysis_source_counts,
            'repo_graph': self.make_json_safe(repo_graph or {}),
            'skills_gap_analysis': skills_gap_analysis,
            'frontend_metric_guide': FRONTEND_METRIC_GUIDE,
            'top_findings': top_findings,
            'top_files': top_files,
            'files': analyses,
            'skipped_files': skipped_files or []
        }

    def save_json_report(self, report_data, repo_name):
        """Persist the canonical JSON report for later rendering and integrations"""
        safe_name = repo_name.replace('/', '_').replace('\\', '_')
        output_path = self.json_output_dir / f"{safe_name}_analysis.json"
        with open(output_path, 'w', encoding='utf-8') as handle:
            json.dump(self.make_json_safe(report_data), handle, indent=2)
        print(f"✅ JSON analysis saved: {output_path}")
        return str(output_path)

    def generate_pdf_report(self, report_data, output_file='analysis_report.pdf'):
        """Generate a concise PDF report from the canonical JSON report"""
        print(f"\n📄 Generating comprehensive PDF report: {output_file}")

        doc = SimpleDocTemplate(output_file, pagesize=letter,
                                rightMargin=0.7*inch, leftMargin=0.7*inch,
                                topMargin=0.8*inch, bottomMargin=0.65*inch)

        story = []
        styles = getSampleStyleSheet()

        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=22,
            textColor=HexColor('#12355b'),
            spaceAfter=14,
            alignment=TA_CENTER,
            fontName='Helvetica-Bold'
        )
        heading_style = ParagraphStyle(
            'CustomHeading',
            parent=styles['Heading2'],
            fontSize=15,
            textColor=HexColor('#1d4e89'),
            spaceAfter=10,
            spaceBefore=10,
            fontName='Helvetica-Bold'
        )
        body_style = ParagraphStyle(
            'Body',
            parent=styles['BodyText'],
            fontSize=9.5,
            leading=12
        )
        compact_style = ParagraphStyle(
            'Compact',
            parent=body_style,
            fontSize=8.7,
            leading=10.5
        )

        summary = report_data['summary']
        aggregate = report_data['aggregate_metrics']

        story.append(Paragraph("AI Repository Risk and Quality Analysis", title_style))
        story.append(Paragraph(f"<b>Repository:</b> {html.escape(report_data['repo']['name'])}", body_style))
        story.append(Paragraph(f"<b>Generated:</b> {html.escape(report_data['repo']['generated_at'])}", body_style))
        story.append(Paragraph(f"<b>Source of truth:</b> JSON-first report with PDF rendered from structured analysis data", body_style))
        story.append(Spacer(1, 0.16*inch))

        score_cards = [
            ['Files Scanned', str(summary['files_scanned']), 'Overall', f"{aggregate.get('overallScore', 0)}/100"],
            ['Critical', str(summary['critical_findings']), 'High', str(summary['high_findings'])],
            ['Frontend', str(summary['frontend_files']), 'CI/CD', str(summary['cicd_files'])],
            ['Infra', str(summary['infra_files']), 'Dependencies', str(summary['dependency_manifests'])],
            ['LLM-backed', str(report_data.get('analysis_source_counts', {}).get('llm', 0)), 'Local-only', str(report_data.get('analysis_source_counts', {}).get('local', 0))],
            ['Cache Hits', str(summary.get('cache_hits', 0)), 'Refreshed', str(summary.get('refreshed_files', 0))]
        ]
        score_table = Table(score_cards, colWidths=[1.5*inch, 0.9*inch, 1.5*inch, 0.9*inch])
        score_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), HexColor('#eef4fb')),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#c8d7eb')),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('TEXTCOLOR', (0, 0), (-1, -1), HexColor('#12355b')),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
        ]))
        story.append(score_table)
        story.append(Spacer(1, 0.18*inch))

        story.append(Paragraph("Score Snapshot", heading_style))
        metrics_rows = [['Metric', 'Score', 'Grade', 'Status']]
        for label, key in [('Overall', 'overallScore'), ('Accuracy', 'accuracy'), ('Complexity', 'complexity'),
                           ('Efficiency', 'efficiency'), ('Maintainability', 'maintainability'),
                           ('Documentation', 'documentation')]:
            score = aggregate.get(key, 0)
            metrics_rows.append([label, f"{score}/100", self.get_grade(score), self.get_status(score)])
        metrics_table = Table(metrics_rows, colWidths=[1.6*inch, 1.0*inch, 0.9*inch, 1.7*inch])
        metrics_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1d4e89')),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BACKGROUND', (0, 1), (-1, -1), HexColor('#f8fbff')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [HexColor('#f8fbff'), HexColor('#edf4fb')]),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#c8d7eb')),
            ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ]))
        story.append(metrics_table)
        story.append(Spacer(1, 0.15*inch))

        story.append(Paragraph("Category Breakdown", heading_style))
        category_rows = [['Category', 'Findings']]
        for category, count in sorted(report_data['category_counts'].items(), key=lambda item: (-item[1], item[0])):
            category_rows.append([category.replace('_', ' ').title(), str(count)])
        if len(category_rows) == 1:
            category_rows.append(['No local security findings detected', '0'])
        category_table = Table(category_rows, colWidths=[3.7*inch, 1.0*inch])
        category_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#274c77')),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#bdd1e5')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, HexColor('#f4f8fc')]),
            ('ALIGN', (1, 1), (1, -1), 'CENTER')
        ]))
        story.append(category_table)
        story.append(PageBreak())

        story.append(Paragraph("Top Findings", heading_style))
        if report_data['top_findings']:
            for finding in report_data['top_findings']:
                severity = finding['severity']
                color = FINDING_COLORS.get(severity, '#546e7a')
                title = html.escape(finding['title'])
                evidence = html.escape(str(finding['evidence'])[:180])
                impact = html.escape(str(finding['impact'])[:220])
                fix = html.escape(str(finding['fix'])[:220])
                story.append(Paragraph(
                    f"<font color='{color}'><b>[{severity}]</b></font> {title}",
                    body_style
                ))
                story.append(Paragraph(
                    f"<b>{html.escape(finding['file'])}</b> | {html.escape(finding['location'])} | "
                    f"{html.escape(finding['category'].replace('_', ' ').title())}",
                    compact_style
                ))
                story.append(Paragraph(f"<b>Evidence:</b> {evidence}", compact_style))
                story.append(Paragraph(f"<b>Impact:</b> {impact}", compact_style))
                story.append(Paragraph(f"<b>Fix:</b> {fix}", compact_style))
                story.append(Spacer(1, 0.08*inch))
        else:
            story.append(Paragraph("No local security findings were detected in the current scan.", body_style))

        story.append(Spacer(1, 0.12*inch))
        story.append(Paragraph("Frontend Metric Guide", heading_style))
        for item in report_data['frontend_metric_guide']:
            story.append(Paragraph(f"<b>{html.escape(item['label'])}</b> {html.escape(item['aim'])}", body_style))
            story.append(Spacer(1, 0.04*inch))

        story.append(PageBreak())
        story.append(Paragraph("File Overview", heading_style))
        file_rows = [['File', 'Type', 'Score', 'Findings', 'Top Severity']]
        for analysis in report_data['top_files']:
            risk_summary = analysis.get('riskSummary', {})
            graph = analysis.get('graph', {})
            file_rows.append([
                html.escape(analysis['file'])[:40],
                html.escape(analysis.get('fileType', 'unknown')),
                f"{analysis.get('overallScore', 0)} / H{graph.get('hotspot_score', 0)}",
                str(risk_summary.get('total_findings', 0)),
                f"{risk_summary.get('top_severity', 'Info')} / In {graph.get('imports_in', 0)}"
            ])
        file_table = Table(file_rows, colWidths=[2.45*inch, 1.0*inch, 1.0*inch, 0.6*inch, 1.3*inch])
        file_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#1d3557')),
            ('TEXTCOLOR', (0, 0), (-1, 0), white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#c8d7eb')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, HexColor('#f8fbff')]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('ALIGN', (2, 1), (4, -1), 'CENTER')
        ]))
        story.append(file_table)

        story.append(Spacer(1, 0.15*inch))
        story.append(Paragraph("Priority Actions", heading_style))
        if report_data['top_findings']:
            for finding in report_data['top_findings'][:5]:
                story.append(Paragraph(
                    f"• <b>{html.escape(finding['title'])}</b>: {html.escape(finding['fix'])}",
                    body_style
                ))
        else:
            story.append(Paragraph("• Keep dependency, CI/CD, and secret scans in the pipeline so this remains a regression check.", body_style))

        doc.build(story)
        print(f"✅ Comprehensive PDF report generated: {output_file}")
    
    def get_grade(self, score):
        """Convert score to letter grade"""
        if score >= 90: return 'A+'
        elif score >= 80: return 'A'
        elif score >= 70: return 'B'
        elif score >= 60: return 'C'
        elif score >= 50: return 'D'
        else: return 'F'
    
    def get_status(self, score):
        """Get status indicator for score"""
        if score >= 80: return '✓ Excellent'
        elif score >= 60: return '~ Good'
        elif score >= 40: return '⚠ Needs Work'
        else: return '✗ Critical'

# Main execution
if __name__ == "__main__":
    import sys
    import argparse

    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass
    
    print("\n" + "="*60)
    print("🤖 AI-Powered Comprehensive Repository Analyzer")
    print("   Enhanced with Progress Saving & Rate Limiting")
    print("="*60 + "\n")
    
    # Argument parser
    parser = argparse.ArgumentParser(description='Analyze code repositories with AI')
    parser.add_argument('repo_url', nargs='?', help='GitHub repository URL')
    parser.add_argument('--config', '-c', help='Configuration file path (YAML)')
    parser.add_argument('--resume', '-r', action='store_true', help='Resume previous analysis')
    parser.add_argument('--incremental', action='store_true', help='Reuse cached analysis for unchanged files')
    parser.add_argument('--max-files', type=int, help='Maximum number of files to analyze')
    
    args = parser.parse_args()
    
    # Get repository URL
    repo_url = args.repo_url
    if not repo_url:
        repo_url = input("Enter GitHub repository URL: ").strip()
        if not repo_url:
            print("❌ No repository URL provided")
            sys.exit(1)
    
    # Initialize analyzer with config
    analyzer = RepositoryAnalyzer(config_file=args.config)
    
    try:
        # Clone repository
        repo_dir = analyzer.clone_repository(repo_url)
        repo_name = repo_url.split('/')[-1].replace('.git', '')
        
        # Analyze repository
        analysis_result = analyzer.analyze_repository(repo_dir, repo_name, resume=args.resume, incremental=args.incremental)
        
        if analysis_result and analysis_result.get('analyses'):
            analyses = analysis_result['analyses']
            # Limit files if specified
            if args.max_files and len(analyses) > args.max_files:
                print(f"\n⚠️  Limiting to first {args.max_files} files (use --max-files to change)")
                analyses = analyses[:args.max_files]
            
            report_data = analyzer.build_report_data(
                analyses,
                repo_name,
                repo_dir,
                skipped_files=analysis_result.get('skipped_files', []),
                cache_hits=analysis_result.get('cache_hits', 0),
                refreshed_files=analysis_result.get('refreshed_files', 0),
                repo_graph=analysis_result.get('repo_graph', {})
            )
            json_output = analyzer.save_json_report(report_data, repo_name)
            output_file = analyzer.reports_dir / f"{repo_name}_comprehensive_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf"
            analyzer.generate_pdf_report(report_data, str(output_file))
            
            print("\n" + "="*60)
            print("✅ Comprehensive Analysis Complete!")
            print(f"📊 Total files analyzed: {len(analyses)}")
            print(f"📄 Detailed report saved to: {output_file}")
            print(f"🧾 Structured JSON saved to: {json_output}")
            print(f"🔧 API requests made: {analyzer.request_count}")
            print("="*60 + "\n")
            
            # Clean up progress file on success
            if os.path.exists(analyzer.progress_file):
                os.remove(analyzer.progress_file)
                print("✅ Progress file cleaned up")
        else:
            print("\n❌ No analysis results generated")
        
        print("\n📝 Temporary repository kept at: temp_repo")
        print("   (You can delete it manually or it will be overwritten next run)")
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Analysis interrupted by user")
        print("💾 Progress saved! Use --resume to continue from where you left off")
        sys.exit(0)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        print("\n💾 Progress may have been saved. Use --resume to continue")
        sys.exit(1)
