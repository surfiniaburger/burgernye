import inspect
import pkgutil
import importlib
import sys

def find_class_in_package(package, class_name):
    """Recursively search for a class in a package and print its import path."""
    try:
        pkg = importlib.import_module(package.__name__)
    except ImportError as e:
        print(f"Could not import {package.__name__}: {e}")
        return

    for _, modname, _ in pkgutil.walk_packages(
        path=pkg.__path__, prefix=pkg.__name__ + '.', onerror=lambda x: None
    ):
        try:
            module = importlib.import_module(modname)
            if hasattr(module, class_name):
                print(f"\n>>> Found '{class_name}'!")
                print(f"Suggested import: from {module.__name__} import {class_name}")
        except Exception:
            continue

if __name__ == "__main__":
    try:
        import mcp
        print("--- Searching for 'StreamableHttpTransport' in 'mcp' package ---")
        find_class_in_package(mcp, "StreamableHttpTransport")
        print("\n--- Searching for 'HttpTransport' in 'mcp' package ---")
        find_class_in_package(mcp, "HttpTransport")
        print("\n--- Searching for 'StdioTransport' in 'mcp' package ---")
        find_class_in_package(mcp, "StdioTransport")
        print("\n--- Searching for 'Server' in 'mcp' package ---")
        find_class_in_package(mcp, "Server")
        print("\nIntrospection complete.")
    except ImportError:
        print("Error: The 'mcp' package is not installed.")
        sys.exit(1)