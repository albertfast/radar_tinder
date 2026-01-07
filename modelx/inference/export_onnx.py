"""
Export trained PyTorch model to ONNX format
Usage: python export_onnx.py --checkpoint ../model/best_epoch_57_acc_96.58.pth
"""

import os
import sys
import argparse
import torch
import onnx
import onnxruntime as ort
import numpy as np

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'model'))
from model_architecture import WarningLightsResNet50


def export_to_onnx(checkpoint_path, output_path, num_classes=68, opset_version=12):
    """
    Export PyTorch model to ONNX format
    
    Args:
        checkpoint_path (str): Path to .pth checkpoint
        output_path (str): Output path for .onnx file
        num_classes (int): Number of output classes
        opset_version (int): ONNX opset version
    """
    print(f"Loading PyTorch checkpoint: {checkpoint_path}")
    
    # Load model
    model = WarningLightsResNet50(num_classes=num_classes, pretrained=False)
    checkpoint = torch.load(checkpoint_path, map_location='cpu')
    model.load_state_dict(checkpoint['model_state_dict'])
    model.eval()
    
    print(f"✅ Model loaded (Epoch: {checkpoint.get('epoch', 'N/A')}, "
          f"Val Acc: {checkpoint.get('val_acc', 'N/A'):.2f}%)")
    
    # Create dummy input
    dummy_input = torch.randn(1, 3, 224, 224)
    
    # Export to ONNX
    print(f"\nExporting to ONNX (opset {opset_version})...")
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=opset_version,
        do_constant_folding=True,
        input_names=['input'],
        output_names=['output'],
        dynamic_axes={
            'input': {0: 'batch_size'},
            'output': {0: 'batch_size'}
        }
    )
    
    print(f"✅ ONNX model saved to: {output_path}")
    
    # Validate ONNX model
    print("\nValidating ONNX model...")
    onnx_model = onnx.load(output_path)
    onnx.checker.check_model(onnx_model)
    print("✅ ONNX model is valid")
    
    # Test with ONNX Runtime
    print("\nTesting with ONNX Runtime...")
    ort_session = ort.InferenceSession(output_path)
    
    # Get input/output info
    input_name = ort_session.get_inputs()[0].name
    output_name = ort_session.get_outputs()[0].name
    
    print(f"  Input: {input_name}, shape: {ort_session.get_inputs()[0].shape}")
    print(f"  Output: {output_name}, shape: {ort_session.get_outputs()[0].shape}")
    
    # Test inference
    test_input = np.random.randn(1, 3, 224, 224).astype(np.float32)
    outputs = ort_session.run([output_name], {input_name: test_input})
    
    print(f"✅ Inference successful! Output shape: {outputs[0].shape}")
    
    # File size
    file_size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"\nONNX model size: {file_size_mb:.2f} MB")
    
    print("\n" + "="*60)
    print("✅ Export completed successfully!")
    print("="*60)


def main():
    parser = argparse.ArgumentParser(description="Export PyTorch model to ONNX")
    parser.add_argument(
        '--checkpoint', '-c',
        type=str,
        default='../model/best_epoch_57_acc_96.58.pth',
        help='Path to PyTorch checkpoint (.pth)'
    )
    parser.add_argument(
        '--output', '-o',
        type=str,
        default='../model/warning_lights_resnet50.onnx',
        help='Output path for ONNX model'
    )
    parser.add_argument(
        '--num-classes', '-n',
        type=int,
        default=68,
        help='Number of output classes'
    )
    parser.add_argument(
        '--opset', '-op',
        type=int,
        default=12,
        help='ONNX opset version'
    )
    
    args = parser.parse_args()
    
    # Validate checkpoint exists
    if not os.path.exists(args.checkpoint):
        print(f"❌ Error: Checkpoint not found: {args.checkpoint}")
        return
    
    # Export
    export_to_onnx(
        checkpoint_path=args.checkpoint,
        output_path=args.output,
        num_classes=args.num_classes,
        opset_version=args.opset
    )


if __name__ == "__main__":
    main()
